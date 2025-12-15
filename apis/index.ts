import express from 'express';
import stakeRouter from './stake';
import txRouter from './tx';
import transferRouter from './transfer';
import { initializeTables, pool } from '../database/models';
import { connectDB } from '../database/connect';

// Connect DB
connectDB().then(async () => {
  await initializeTables();
  console.log('Tables initialized');
});

const app = express();
app.use(express.json());

// We only need the Stake router now, which handles Portfolio, Stake, and Unstake
app.use('/stake', stakeRouter);

// Simple tx viewer
app.use('/tx', txRouter);
// Admin transfer endpoints (wallet send, contract payout)
app.use('/transfer', transferRouter);
// Ledger alias for CLI compatibility
app.use('/ledger', txRouter);

// Helper to see tiers
app.get('/tiers', async (_req: express.Request, res: express.Response) => {
    const result = await pool.query('SELECT * FROM tiers');
    res.json(result.rows);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Staking API server running on port ${PORT}`);
});