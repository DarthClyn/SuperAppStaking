// Main Express server for staking API
import express, { Request, Response } from 'express';
import stakeRouter from './stake';
import rewardsRouter from './rewards';
import poolRouter from './pool';
import ledgerRouter from './ledger';
import { Stake, Pool, Ledger, initializeTables } from '../database/models';
import { connectDB } from '../database/connect';

// PostgreSQL connection
connectDB().then(async () => {
  console.log('PostgreSQL connected');
  await initializeTables();
  console.log('Tables initialized');
}).catch(err => {
  console.error('PostgreSQL connection error:', err);
});

const app = express();
app.use(express.json());

app.use('/stake', stakeRouter);
app.use('/rewards', rewardsRouter);
app.use('/pool', poolRouter);
app.use('/ledger', ledgerRouter);

app.get('/', (_req: Request, res: Response) => {
  res.send('User-side staking API is running');
});

// Admin endpoint to clear database
app.post('/admin/clear-database', async (_req: Request, res: Response) => {
  try {
    await Stake.deleteMany({});
    await Pool.deleteMany({});
    await Ledger.deleteMany({});
    res.json({ success: true, message: 'Database cleared successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`User-side staking API server running on port ${PORT}`);
});
