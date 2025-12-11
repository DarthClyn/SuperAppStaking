import * as express from 'express';
import { Request, Response } from 'express'; // Keep named imports separate for clarity

const router = express.Router(); // This now correctly accesses the Router function

import { pool } from '../database/connect';
import { contract } from '../config'; // Using the Admin-connected contract
import { ethers } from 'ethers';


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
        await pool.query('BEGIN');

        // Fetch Stake
        const stakeRes = await pool.query('SELECT * FROM stakes WHERE id = $1 AND status = \'ACTIVE\'', [stakeId]);
        if (stakeRes.rows.length === 0) throw new Error("Stake not found or inactive");
        const stake = stakeRes.rows[0];

        // Check Maturity
        if (new Date() < new Date(stake.end_time)) {
             throw new Error(`Locked until ${new Date(stake.end_time).toISOString()}`);
        }

        // Calculate Payout
        const principal = BigInt(stake.amount_wei);
        const reward = BigInt(stake.projected_reward_wei);
        const totalPayout = principal + reward;

        console.log(`Admin processing payout: ${ethers.formatEther(totalPayout)} ETH to ${stake.user_address}`);

        // --- INTERACT WITH CONTRACT ---
        // This uses the Admin Wallet to pay gas
        const tx = await contract.payoutUser(stake.user_address, totalPayout);
        console.log(`Tx sent: ${tx.hash}, waiting for confirmation...`);
        await tx.wait(); // Wait for block confirmation

        // Update DB
        await pool.query('UPDATE stakes SET status = \'COMPLETED\' WHERE id = $1', [stakeId]);
        await pool.query(`
            INSERT INTO transactions (tx_hash, user_address, type, amount_wei)
            VALUES ($1, $2, 'WITHDRAWAL_PAYOUT', $3)
        `, [tx.hash, stake.user_address, totalPayout.toString()]);

        await pool.query('COMMIT');
        res.json({ success: true, txHash: tx.hash, amount: ethers.formatEther(totalPayout) });

    } catch (err: any) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

export default router;