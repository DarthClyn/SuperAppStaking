import { pool } from '../database/connect';
import { initializeTables } from '../database/models';
import { contract, provider, CONTRACT_ADDRESS } from '../config';
import { ethers } from 'ethers';

async function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

// Reward calc using integer math to avoid floating precision issues
// reward = principalWei * apr% * (days/365) / 100
const calculateReward = (principalWei: bigint, apr: number, days: number): bigint => {
    // Scale apr and days to retain precision
    const APR_SCALE = 1_000_000; // 1e6
    const DAYS_SCALE = 1_000_000; // 1e6

    const aprScaled = BigInt(Math.round(apr * APR_SCALE)); // apr * 1e6
    const daysScaled = BigInt(Math.round(days * DAYS_SCALE)); // days * 1e6

    const numerator = principalWei * aprScaled * daysScaled;
    const denom = BigInt(100) * BigInt(365) * BigInt(APR_SCALE) * BigInt(DAYS_SCALE);
    return numerator / denom;
};

async function processOnce() {
    const tiersRes = await pool.query('SELECT * FROM tiers');
    for (const tier of tiersRes.rows) {
        const tierId = tier.id;
        const waitingSeconds = tier.waiting_period_seconds || 604800;
        const thresholdWei = BigInt(tier.activation_threshold_wei || '0');

        // Sum unbatched amounts (stakes not yet included in an on-chain batch)
        const sumRes = await pool.query(`SELECT COALESCE(SUM(amount_wei),0)::text as total FROM stakes WHERE onchain_batched_at IS NULL AND tier_id = $1 AND status IN ('REQUESTED','ACTIVE','ENDED')`, [tierId]);
        const totalUnbatched = BigInt(sumRes.rows[0].total || '0');

        // Log totals for debugging (show ETH values)
        try {
            const totalEth = ethers.formatEther(totalUnbatched);
            const thresholdEth = ethers.formatEther(thresholdWei);
            console.log(`Tier ${tier.name} (${tierId}) unbatched total ${totalUnbatched} wei (${totalEth} ETH) threshold ${thresholdWei} wei (${thresholdEth} ETH)`);
        } catch (e) {
            console.log(`Tier ${tier.name} (${tierId}) unbatched total ${totalUnbatched} wei; threshold ${thresholdWei} wei`);
        }

        
        // Activate REQUESTED stakes whose waiting period has elapsed (set start_time based on requested_at + waiting)
        try {
            const now = new Date();
            const activateRes = await pool.query(`SELECT * FROM stakes WHERE status = 'REQUESTED' AND tier_id = $1 AND (requested_at + make_interval(secs => $2)) <= $3 FOR UPDATE`, [tierId, waitingSeconds, now]);
            if (activateRes.rows.length > 0) {
                await pool.query('BEGIN');
                for (const s of activateRes.rows) {
                    // compute start_time = requested_at + waitingSeconds
                    const startTs = new Date(new Date(s.requested_at).getTime() + Number(waitingSeconds) * 1000);
                    const endTs = new Date(startTs.getTime() + (Number(tier.duration_days) * 24 * 60 * 60 * 1000));
                    const rewardWei = calculateReward(BigInt(s.amount_wei), parseFloat(tier.apr_percentage), Number(tier.duration_days));
                    await pool.query(`UPDATE stakes SET status='ACTIVE', start_time=$1, end_time=$2, projected_reward_wei=$3, last_claimed=$1 WHERE id=$4`, [startTs, endTs, rewardWei.toString(), s.id]);
                }
                await pool.query('COMMIT');
                console.log(`Activated ${activateRes.rows.length} stakes for tier ${tier.name} (${tierId})`);
            }
        } catch (err) {
            try { await pool.query('ROLLBACK'); } catch (e) {}
            console.error('Error activating requested stakes:', err);
        }

        // After activation, check unbatched total and, if threshold met, call on-chain batch for unbatched stakes
        try {
            const poolSumRes = await pool.query(`SELECT COALESCE(SUM(amount_wei),0)::text as total FROM stakes WHERE onchain_batched_at IS NULL AND tier_id = $1 AND status IN ('REQUESTED','ACTIVE','ENDED')`, [tierId]);
            const poolTotal = BigInt(poolSumRes.rows[0].total || '0');
            if (poolTotal >= thresholdWei && poolTotal > 0n) {
                const rows = await pool.query(`SELECT * FROM stakes WHERE onchain_batched_at IS NULL AND tier_id = $1 AND status IN ('REQUESTED','ACTIVE','ENDED') FOR UPDATE`, [tierId]);
                if (rows.rows.length > 0) {
                    const count = rows.rows.length;
                    const pubkeys = new Array(count).fill('0x');
                    const signatures = new Array(count).fill('0x');
                    const depositRoots = new Array(count).fill('0x' + '00'.repeat(32));
                    console.log(`Threshold reached for tier ${tier.name} (${tierId}). Calling on-chain batch for ${count} entries`);
                    if (typeof contract.batchStakeToDBeacon === 'function') {
                        try {
                            const contractAddr = CONTRACT_ADDRESS;
                            const bal = await provider.getBalance(contractAddr);
                            const contractBalance = BigInt(bal.toString());
                            const perEntry = BigInt(ethers.parseEther('0.032').toString());
                            const required = perEntry * BigInt(count);
                            if (contractBalance < required) {
                                console.warn(`Skipping on-chain batch: contract balance ${ethers.formatEther(contractBalance)} ETH < required ${ethers.formatEther(required)} ETH`);
                            } else {
                                const tx = await contract.batchStakeToDBeacon(pubkeys, signatures, depositRoots);
                                console.log(`batchStakeToDBeacon tx sent ${tx.hash}, waiting...`);
                                await tx.wait();
                                console.log('batchStakeToDBeacon confirmed');
                                // mark these stakes as batched on-chain and record tx in DB
                                const nowTs = new Date();
                                let totalAmount = 0n;
                                for (const s of rows.rows) {
                                    totalAmount += BigInt(s.amount_wei);
                                }
                                await pool.query('BEGIN');
                                for (const s of rows.rows) {
                                    await pool.query(`UPDATE stakes SET onchain_batched_at=$1 WHERE id=$2`, [nowTs, s.id]);
                                }
                                await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES ($1, NULL, 'BATCH_STAKE', $2)`, [tx.hash, totalAmount.toString()]);
                                await pool.query('COMMIT');
                            }
                        } catch (err) {
                            console.error('Error while preparing or sending batchStakeToDBeacon:', err);
                            try { await pool.query('ROLLBACK'); } catch (e) {}
                        }
                    } else {
                        console.warn('contract.batchStakeToDBeacon() is not available on contract instance — check ABI / contract address');
                    }
                }
            }
        } catch (err) {
            console.error('Error checking/performing on-chain batch:', err);
        }

        // Process UNSTAKE_REQUESTED stakes whose delay has elapsed
        try {
            const now = new Date();
            const unstakeRes = await pool.query(`SELECT s.*, t.unstake_delay_seconds, t.apr_percentage, t.duration_days, t.name as tier_name FROM stakes s JOIN tiers t ON s.tier_id = t.id WHERE s.status = 'UNSTAKE_REQUESTED' AND s.tier_id = $1 AND (unstake_requested_at + make_interval(secs => t.unstake_delay_seconds)) <= $2 FOR UPDATE`, [tierId, now]);
            if (unstakeRes.rows.length > 0) {
                for (const s of unstakeRes.rows) {
                    try {
                        await pool.query('BEGIN');
                        // Compute principal payout and auto-claim any accrued rewards up to now
                        const principal = BigInt(s.amount_wei);
                        let claimable = 0n;
                        try {
                            const nowMs = Date.now();
                            const startMs = s.start_time ? new Date(s.start_time).getTime() : 0;
                            const lastClaimedMs = s.last_claimed ? new Date(s.last_claimed).getTime() : startMs;
                            const endMs = s.end_time ? new Date(s.end_time).getTime() : nowMs;
                            const effectiveStart = Math.max(lastClaimedMs, startMs);
                            const effectiveEnd = Math.min(nowMs, endMs);
                            if (effectiveEnd > effectiveStart) {
                                const secondsElapsed = Math.floor((effectiveEnd - effectiveStart) / 1000);
                                const accrualInterval = (s.tier_id === 3) ? 30 : 86400;
                                const intervals = Math.floor(secondsElapsed / accrualInterval);
                                if (intervals > 0) {
                                    const perIntervalReward = calculateReward(BigInt(s.amount_wei), parseFloat(s.apr_percentage), accrualInterval / 86400);
                                    claimable = perIntervalReward * BigInt(intervals);
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to compute claimable rewards during unstake, proceeding with principal only', e);
                        }

                        // Check contract balance
                        let contractBalance = 0n;
                        try {
                            const contractAddr = CONTRACT_ADDRESS;
                            const bal = await provider.getBalance(contractAddr);
                            contractBalance = BigInt(bal.toString());
                        } catch (e) {
                            console.warn('Could not read contract balance before unstake payout:', e);
                        }

                        const payoutAmount = principal + claimable;
                        if (typeof contract.payoutUser === 'function' && contractBalance >= payoutAmount) {
                            try {
                                const tx = await contract.payoutUser(s.user_address, payoutAmount);
                                console.log(`Unstake payout tx sent for stake ${s.id}: ${tx.hash}, waiting...`);
                                await tx.wait();

                                await pool.query(`UPDATE stakes SET status='COMPLETED' WHERE id = $1`, [s.id]);
                                await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES ($1, $2, 'UNSTAKE_PAYOUT', $3)`, [tx.hash, s.user_address, payoutAmount.toString()]);
                                if (claimable > 0n) {
                                    await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES ($1, $2, 'CLAIM', $3)`, [tx.hash, s.user_address, claimable.toString()]);
                                    const lastSet = s.end_time ? new Date(s.end_time) : new Date();
                                    await pool.query(`UPDATE stakes SET last_claimed = $1 WHERE id = $2`, [lastSet, s.id]);
                                }
                                await pool.query('COMMIT');
                                console.log(`Unstaked stake ${s.id} to ${s.user_address} on-chain tx ${tx.hash}`);
                            } catch (err) {
                                await pool.query('ROLLBACK');
                                console.error('On-chain unstake payout failed for stake', s.id, err);
                                try { await pool.query('BEGIN'); await pool.query(`UPDATE stakes SET status='UNSTAKE_FAILED' WHERE id = $1`, [s.id]); await pool.query('COMMIT'); } catch (e) { await pool.query('ROLLBACK'); }
                            }
                        } else {
                            // Credit user's platform balance (principal + claimable)
                            const totalLocal = payoutAmount;
                            await pool.query(`UPDATE users SET available_balance_wei = available_balance_wei + $1 WHERE wallet_address = $2`, [totalLocal.toString(), s.user_address]);
                            await pool.query(`UPDATE stakes SET status='COMPLETED' WHERE id = $1`, [s.id]);
                            await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES (NULL, $1, 'UNSTAKE_PAYOUT', $2)`, [s.user_address, totalLocal.toString()]);
                            if (claimable > 0n) {
                                await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES (NULL, $1, 'CLAIM', $2)`, [s.user_address, claimable.toString()]);
                                const lastSet = s.end_time ? new Date(s.end_time) : new Date();
                                await pool.query(`UPDATE stakes SET last_claimed = $1 WHERE id = $2`, [lastSet, s.id]);
                            }
                            await pool.query('COMMIT');
                            console.log(`Unstaked stake ${s.id} to ${s.user_address} via platform balance`);
                        }
                    } catch (err) {
                        try { await pool.query('ROLLBACK'); } catch (e) {}
                        console.error('Error processing unstake payout for stake', s.id, err);
                    }
                }
            }
        } catch (err) {
            try { await pool.query('ROLLBACK'); } catch (e) {}
            console.error('Error processing UNSTAKE_REQUESTED stakes:', err);
        }

        // Mark ACTIVE stakes that have reached end_time as ENDED (period finished)
        try {
            const now = new Date();
            const endRes = await pool.query(`SELECT id FROM stakes WHERE status = 'ACTIVE' AND tier_id = $1 AND end_time <= $2 FOR UPDATE`, [tierId, now]);
            if (endRes.rows.length > 0) {
                await pool.query('BEGIN');
                for (const r of endRes.rows) {
                    await pool.query(`UPDATE stakes SET status='ENDED' WHERE id = $1`, [r.id]);
                }
                await pool.query('COMMIT');
                console.log(`Marked ${endRes.rows.length} stakes as ENDED for tier ${tier.name} (${tierId})`);
            }
        } catch (err) {
            try { await pool.query('ROLLBACK'); } catch (e) {}
            console.error('Error marking ended stakes:', err);
        }

        // Continue to next tier
        continue;
    }
}


async function runLoop() {
    console.log('Activation processor starting...');
    await initializeTables();
    while (true) {
        try {
            await processOnce();
        } catch (err) {
            console.error('Error in activation processor:', err);
        }
        // Sleep short interval (15s)
        await sleep(15000);
    }
}

runLoop();
