
import * as express from 'express';
import { Request, Response } from 'express'; // Keep named imports separate for clarity

const router = express.Router(); // This now correctly accesses the Router function

import { pool } from '../database/connect';

// Returns the global history of deposits (ingress) and withdrawals (egress)
router.get('/', async (_req: Request, res: Response) => {
    try {
        // Fetch all transactions ordered by newest first
        const result = await pool.query(`
            SELECT 
                id, 
                tx_hash, 
                user_address, 
                type, 
                amount_wei, 
                timestamp 
            FROM transactions 
            ORDER BY timestamp DESC
        `);
        
        res.json(result.rows);
    } catch (err: any) {
        console.error("Error fetching ledger:", err);
        res.status(500).json({ error: "Failed to fetch ledger history" });
    }
});

export default router;