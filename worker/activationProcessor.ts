import { pool } from '../database/connect';
import { initializeTables } from '../database/models';
import { contract, provider } from '../config';
import { ethers } from 'ethers';

async function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

// Simple reward calc (mirrors apis/stake.ts)
const calculateReward = (principalWei: bigint, apr: number, days: number): bigint => {
    const principal = Number(ethers.formatEther(principalWei));
    const interest = principal * (apr / 100) * (days / 365);
    return ethers.parseEther(interest.toFixed(18));
};

async function processOnce() {
    const tiersRes = await pool.query('SELECT * FROM tiers');
    for (const tier of tiersRes.rows) {
        const tierId = tier.id;
        const waitingSeconds = tier.waiting_period_seconds || 604800;
        const thresholdWei = BigInt(tier.activation_threshold_wei || '0');

        // Sum requested amounts
        const sumRes = await pool.query(`SELECT COALESCE(SUM(amount_wei),0)::text as total FROM stakes WHERE status = 'REQUESTED' AND tier_id = $1`, [tierId]);
        const totalRequested = BigInt(sumRes.rows[0].total || '0');

        // Log totals for debugging (show ETH values)
        try {
            const totalEth = ethers.formatEther(totalRequested);
            const thresholdEth = ethers.formatEther(thresholdWei);
            console.log(`Tier ${tier.name} (${tierId}) requested total ${totalRequested} wei (${totalEth} ETH) threshold ${thresholdWei} wei (${thresholdEth} ETH)`);
        } catch (e) {
            console.log(`Tier ${tier.name} (${tierId}) requested total ${totalRequested} wei; threshold ${thresholdWei} wei`);
        }

        if (totalRequested >= thresholdWei && totalRequested > 0n) {
            console.log(`Tier ${tier.name} (${tierId}) reached threshold: activating ${totalRequested} wei`);
            // Activate all requested stakes for this tier
            await pool.query('BEGIN');
            const reqs = await pool.query(`SELECT * FROM stakes WHERE status = 'REQUESTED' AND tier_id = $1 FOR UPDATE`, [tierId]);
            const now = new Date();
            const updatedIds: number[] = [];
            for (const s of reqs.rows) {
                const start = now;
                const end = new Date(start.getTime() + (Number(tier.duration_days) * 24 * 60 * 60 * 1000));
                const rewardWei = calculateReward(BigInt(s.amount_wei), parseFloat(tier.apr_percentage), Number(tier.duration_days));
                await pool.query(`UPDATE stakes SET status='ACTIVE', start_time=$1, end_time=$2, projected_reward_wei=$3 WHERE id=$4`, [start, end, rewardWei.toString(), s.id]);
                updatedIds.push(s.id);
            }
            await pool.query('COMMIT');

            // Queue on-chain batch deposit (test function) - call contract.batchStakeToDBeacon
            try {
                if (updatedIds.length > 0) {
                    const count = updatedIds.length;
                    const pubkeys = new Array(count).fill('0x');
                    const signatures = new Array(count).fill('0x');
                    const depositRoots = new Array(count).fill('0x' + '00'.repeat(32));
                    console.log(`Calling contract.batchStakeToDBeacon for ${count} entries`);
                    if (typeof contract.batchStakeToDBeacon === 'function') {
                        try {
                            // Ensure contract has sufficient ETH to perform internal transfers
                            const contractAddr = await contract.getAddress();
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
                            }
                        } catch (err) {
                            console.error('Error while preparing or sending batchStakeToDBeacon:', err);
                        }
                    } else {
                        console.warn('contract.batchStakeToDBeacon() is not available on contract instance — check ABI / contract address');
                    }
                }
            } catch (err) {
                console.error('Error calling batchStakeToDBeacon:', err);
            }

        } else {
            // Refund any requests that expired
            const cutoff = new Date(Date.now() - waitingSeconds * 1000);
            const expiredRes = await pool.query(`SELECT * FROM stakes WHERE status = 'REQUESTED' AND tier_id = $1 AND requested_at <= $2`, [tierId, cutoff]);
                    if (expiredRes.rows.length > 0) {
                        for (const s of expiredRes.rows) {
                            try {
                                // Mark stake as REFUNDING to avoid double processing
                                await pool.query('BEGIN');
                                await pool.query(`UPDATE stakes SET status='REFUNDING' WHERE id = $1`, [s.id]);
                                await pool.query('COMMIT');

                                const amountWeiStr = String(s.amount_wei);
                                const amountBn = BigInt(amountWeiStr);

                                // Check contract balance before attempting on-chain payout
                                let contractBalance = 0n;
                                try {
                                    const contractAddr = await contract.getAddress();
                                    const bal = await provider.getBalance(contractAddr);
                                    contractBalance = BigInt(bal.toString());
                                } catch (e) {
                                    console.warn('Could not read contract balance, proceeding to attempt payout (may fail):', e);
                                }

                                if (typeof contract.payoutUser === 'function' && contractBalance >= amountBn) {
                                    try {
                                        const tx = await contract.payoutUser(s.user_address, amountBn);
                                        console.log(`Refund payout tx sent for stake ${s.id}: ${tx.hash}, waiting...`);
                                        await tx.wait();

                                        await pool.query('BEGIN');
                                        await pool.query(`UPDATE stakes SET status='REFUNDED' WHERE id = $1`, [s.id]);
                                        await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES ($1, $2, 'REFUND', $3)`, [tx.hash, s.user_address, amountWeiStr]);
                                        await pool.query('COMMIT');
                                        console.log(`Refunded stake ${s.id} to ${s.user_address} on-chain tx ${tx.hash}`);
                                    } catch (err) {
                                        await pool.query('ROLLBACK');
                                        console.error('On-chain payout failed for stake', s.id, err);
                                        // mark refund as failed so it can be retried or handled manually
                                        try {
                                            await pool.query('BEGIN');
                                            await pool.query(`UPDATE stakes SET status='REFUND_FAILED' WHERE id = $1`, [s.id]);
                                            await pool.query('COMMIT');
                                        } catch (e) {
                                            await pool.query('ROLLBACK');
                                            console.error('Failed to mark REFUND_FAILED for stake', s.id, e);
                                        }
                                    }
                                } else {
                                    // Fallback: credit user's platform balance (no on-chain movement)
                                    await pool.query('BEGIN');
                                    await pool.query(`UPDATE users SET available_balance_wei = available_balance_wei + $1 WHERE wallet_address = $2`, [amountWeiStr, s.user_address]);
                                    await pool.query(`UPDATE stakes SET status='REFUNDED' WHERE id = $1`, [s.id]);
                                    await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES (NULL, $1, 'REFUND', $2)`, [s.user_address, amountWeiStr]);
                                    await pool.query('COMMIT');
                                    console.log(`Refunded stake ${s.id} to ${s.user_address} via platform balance (on-chain payout unavailable or insufficient contract funds)`);
                                }

                            } catch (err) {
                                try { await pool.query('ROLLBACK'); } catch (e) {}
                                console.error('Error processing refund for stake', s.id, err);
                            }
                        }
                    }
            }
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
