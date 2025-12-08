import express, { Request, Response } from 'express';
const router = express.Router();

import { Ledger } from '../database/models';
import { LockPeriods, APRs } from '../types';

// 365 days = 30 min, so 1 month = 2.5 min, 3m = 7.5 min, 6m = 15 min, 12m = 30 min
const LOCK_PERIODS: LockPeriods = {
  'flex': 0,
  '1m': 2.5 * 60,
  '3m': 7.5 * 60,
  '6m': 15 * 60,
  '12m': 30 * 60,
};

const APRS: APRs = {
  'flex': 10,
  '3m': 15,
  '6m': 18,
  '12m': 21,
};

import { Stake } from '../database/models';
let nextId = 1;

// Initialize nextId from database
async function initializeNextId(): Promise<void> {
  try {
    const stakes = await Stake.find();
    if (stakes.length > 0) {
      const maxStakeId = Math.max(...stakes.map(s => s.stake_id));
      nextId = maxStakeId + 1;
    }
  } catch (error) {
    // Tables not yet initialized, keep default nextId = 1
    console.log('Stake table not yet initialized, using default nextId');
  }
}
initializeNextId();


// Register stake request only, do not stake immediately
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { user_id, token, chain, amount, lock } = req.body;
  if (!user_id || !token || !chain || !amount || !lock || !(lock in LOCK_PERIODS)) {
    res.status(400).json({ error: 'Missing or invalid fields' });
    return;
  }
  const now = Date.now();
  const stakingType = lock;
  const apr = APRS[stakingType] || APRS['flex'];
  const lockSeconds = LOCK_PERIODS[stakingType];
  const stake = await Stake.create({
    stake_id: nextId++,
    user_id,
    token,
    chain,
    amount: parseFloat(amount),
    stakingType,
    pool_id: null,
    start_time: now,
    end_time: lockSeconds ? now + lockSeconds * 1000 : 0,
    apr,
    status: 'REQUESTED',
    rewardAccumulated: 0,
    reward_index: 0,
  });
  res.json({ success: true, stake });
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const stake = await Stake.findOne({ stake_id: parseInt(req.params.id) });
  if (!stake) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(stake);
});

router.get('/', async (_req: Request, res: Response) => {
  const stakes = await Stake.find();
  res.json(stakes);
});

router.post('/unstake/:id', async (req: Request, res: Response): Promise<void> => {
  const stake = await Stake.findOne({ stake_id: parseInt(req.params.id) });
  if (!stake) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const now = Date.now();
  if (now < stake.end_time) {
    res.status(400).json({ error: 'Stake is still locked' });
    return;
  }
  await Stake.update({ stake_id: stake.stake_id }, { status: 'RELEASED' });
  // Log to ledger
  await Ledger.create({
    stake_id: stake.stake_id,
    user_id: stake.user_id,
    status: 'RELEASED',
    stakingType: stake.staking_type,
    amount: parseFloat(stake.amount.toString()),
    pool_id: stake.pool_id,
    startTimestamp: stake.start_time,
    endTimestamp: stake.end_time,
    apr: parseFloat(stake.apr.toString())
  });
  res.json({ success: true, stake });
});

export default router;
