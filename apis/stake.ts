import * as express from 'express';
import { Request, Response } from 'express'; // Keep named imports separate for clarity

const router = express.Router(); // This now correctly accesses the Router function

import { pool } from '../database/connect';
import { contract, provider, CONTRACT_ADDRESS } from '../config';
import { ethers } from 'ethers';

// Local reward calc (integer math)
const calculateReward = (principalWei: bigint, apr: number, days: number): bigint => {
    const APR_SCALE = 1_000_000;
    const DAYS_SCALE = 1_000_000;
    const aprScaled = BigInt(Math.round(apr * APR_SCALE));
    const daysScaled = BigInt(Math.round(days * DAYS_SCALE));
    const numerator = principalWei * aprScaled * daysScaled;
    const denom = BigInt(100) * BigInt(365) * BigInt(APR_SCALE) * BigInt(DAYS_SCALE);
    return numerator / denom;
};


// 1. GET ALL STAKES (For CLI List)
router.get('/', async (_req: Request, res: Response) => {
    const result = await pool.query(`
        SELECT s.*, t.name as tier_name 
        FROM stakes s 
        JOIN tiers t ON s.tier_id = t.id
    `);
    res.json(result.rows);
});

// 2. GET USER PORTFOLIO
router.get('/portfolio/:address', async (req: Request, res: Response) => {
    // const { address } = req.params;
    const address = req.params.address.toLowerCase();
    const user = await pool.query('SELECT available_balance_wei FROM users WHERE wallet_address = $1', [address]);
    const activeStakes = await pool.query(`
        SELECT s.*, t.name as tier_name 
        FROM stakes s 
        JOIN tiers t ON s.tier_id = t.id 
        WHERE s.user_address = $1
    `, [address]);

    res.json({
        walletBalance: user.rows[0] ? user.rows[0].available_balance_wei : '0',
        stakes: activeStakes.rows
    });
});

// 3. STAKE (Lock Balance)
router.post('/', async (req: Request, res: Response): Promise<void> => {
    // const { user_id, tier_id, amount } = req.body; // amount in ETH string
    let { user_id, tier_id, amount } = req.body; 
    user_id = user_id.toLowerCase();
    try {
        // Atomic lock: deduct available balance only if sufficient
        const amountWei = ethers.parseEther(amount.toString());

        const tierRes = await pool.query('SELECT * FROM tiers WHERE id = $1', [tier_id]);
        if (tierRes.rows.length === 0) throw new Error("Invalid Tier ID");
        const tier = tierRes.rows[0];

        await pool.query('BEGIN');
        const upd = await pool.query(
            `UPDATE users SET available_balance_wei = available_balance_wei - $1
             WHERE wallet_address = $2 AND available_balance_wei >= $1
             RETURNING available_balance_wei`,
            [amountWei.toString(), user_id]
        );
        if (upd.rows.length === 0) throw new Error('Insufficient available balance or user not found');

        // Insert stake as REQUESTED; actual start_time and projected_reward will be set when activated
        const newStake = await pool.query(`
            INSERT INTO stakes (user_address, tier_id, amount_wei, requested_at, status)
            VALUES ($1, $2, $3, NOW(), 'REQUESTED') RETURNING *
        `, [user_id, tier_id, amountWei.toString()]);

        await pool.query('COMMIT');
        // calculate expected expiry for client convenience
        const waitingSeconds = tier.waiting_period_seconds || 604800;
        const expectedExpiry = new Date(Date.now() + waitingSeconds * 1000);
        res.json({ success: true, stake: newStake.rows[0], expectedExpiry: expectedExpiry.toISOString() });

    } catch (err: any) {
        await pool.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    }
});

// 4. UNSTAKE (Trigger Contract Payout)
router.post('/unstake/:id', async (req: Request, res: Response): Promise<void> => {
    const stakeId = req.params.id;

    try {
        // Instead of immediate payout, create an unstake request that will be processed after the tier's unstake delay
        await pool.query('BEGIN');
        const stakeRes = await pool.query('SELECT * FROM stakes WHERE id = $1 AND status IN ($2,$3) FOR UPDATE', [stakeId, 'ACTIVE', 'ENDED']);
        if (stakeRes.rows.length === 0) {
            await pool.query('ROLLBACK');
            throw new Error("Stake not found or inactive");
        }
        const stake = stakeRes.rows[0];

        // Check minimum lock period
        if (new Date() < new Date(stake.end_time)) {
            await pool.query('ROLLBACK');
            throw new Error(`Locked until ${new Date(stake.end_time).toISOString()}`);
        }

        // Mark as UNSTAKE_REQUESTED and set unstake_requested_at
        await pool.query(`UPDATE stakes SET status='UNSTAKE_REQUESTED', unstake_requested_at=NOW() WHERE id = $1`, [stakeId]);
        await pool.query('COMMIT');
        res.json({ success: true, message: 'Unstake requested; payout will occur after configured delay' });

    } catch (err: any) {
        try { await pool.query('ROLLBACK'); } catch (e) {}
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 5. CLAIM rewards for a user's stakes (or single stake)
router.post('/claim', async (req: Request, res: Response): Promise<void> => {
    const { user_id, stake_id } = req.body;
    if (!user_id) { res.status(400).json({ error: 'user_id required' }); return; }
    const addr = user_id.toLowerCase();
    try {
        // Fetch relevant stakes
        const q = stake_id ? `SELECT s.*, t.apr_percentage, t.duration_days, t.id as tier_id FROM stakes s JOIN tiers t ON s.tier_id = t.id WHERE s.user_address = $1 AND s.id = $2` : `SELECT s.*, t.apr_percentage, t.duration_days, t.id as tier_id FROM stakes s JOIN tiers t ON s.tier_id = t.id WHERE s.user_address = $1`;
        const params = stake_id ? [addr, stake_id] : [addr];
        const stakesRes = await pool.query(q, params as any[]);

        let totalClaimed = 0n;
        await pool.query('BEGIN');
        for (const s of stakesRes.rows) {
            if (!s.start_time) continue; // not active yet
            const now = Date.now();
            const lastClaimed = s.last_claimed ? new Date(s.last_claimed).getTime() : new Date(s.start_time).getTime();
            const endTime = s.end_time ? new Date(s.end_time).getTime() : now;
            const accrualInterval = (s.tier_id === 3) ? 30 : 86400; // testing tier id assumed 3 -> 30s, others daily

            const effectiveStart = Math.max(lastClaimed, new Date(s.start_time).getTime());
            const effectiveEnd = Math.min(now, endTime);
            if (effectiveEnd <= effectiveStart) continue;

            const secondsElapsed = Math.floor((effectiveEnd - effectiveStart) / 1000);
            const intervals = Math.floor(secondsElapsed / accrualInterval);
            if (intervals <= 0) continue;

            // per-interval reward in wei
            const perIntervalReward = calculateReward(BigInt(s.amount_wei), parseFloat(s.apr_percentage), accrualInterval / 86400);
            const claimable = perIntervalReward * BigInt(intervals);
            if (claimable <= 0n) continue;

            // update last_claimed forward by intervals*accrualInterval
            const newLast = new Date(effectiveStart + intervals * accrualInterval * 1000);
            await pool.query(`UPDATE stakes SET last_claimed = $1 WHERE id = $2`, [newLast, s.id]);

            // Attempt on-chain payout for the claim; fallback to platform credit
            let txHash: string | null = null;
                try {
                const contractAddr = CONTRACT_ADDRESS;
                const bal = await provider.getBalance(contractAddr);
                const contractBalance = BigInt(bal.toString());
                if (typeof contract.payoutUser === 'function' && contractBalance >= claimable) {
                    const tx = await contract.payoutUser(addr, claimable);
                    await tx.wait();
                    txHash = tx.hash;
                    await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES ($1, $2, 'CLAIM', $3)`, [txHash, addr, claimable.toString()]);
                } else {
                    // fallback to crediting platform balance
                    await pool.query(`UPDATE users SET available_balance_wei = available_balance_wei + $1 WHERE wallet_address = $2`, [claimable.toString(), addr]);
                    await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES (NULL, $1, 'CLAIM', $2)`, [addr, claimable.toString()]);
                }
            } catch (e) {
                // If on-chain payout fails, fallback to platform credit
                try {
                    await pool.query(`UPDATE users SET available_balance_wei = available_balance_wei + $1 WHERE wallet_address = $2`, [claimable.toString(), addr]);
                    await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES (NULL, $1, 'CLAIM', $2)`, [addr, claimable.toString()]);
                } catch (ee) {
                    console.error('Failed to credit user after claim failure', ee);
                }
            }
            totalClaimed += claimable;
        }
        await pool.query('COMMIT');
        res.json({ success: true, claimedWei: totalClaimed.toString(), claimedEth: ethers.formatEther(totalClaimed) });

    } catch (err: any) {
        try { await pool.query('ROLLBACK'); } catch (e) {}
        console.error('Claim error', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;