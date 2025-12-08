import express, { Request, Response } from 'express';
const router = express.Router();

import * as helpers from './helpers';
import { Stake } from '../database/models';
import * as DUMMYCONTRACT from './DUMMYCONTRACT';

// Dummy DB for redeemed rewards
const redeemed: { [key: string]: number } = {};

// Get current rewards for a user (sum all active stakes)
router.get('/:user_id', async (req: Request, res: Response) => {
  const user_id = req.params.user_id;
  const now = Date.now();
  const totalRewards = DUMMYCONTRACT.getRewards();
  const userStakes = await Stake.find({ user_id, status: 'STAKED' });
  let accrued = 0;
  userStakes.forEach(stake => {
    accrued += helpers.calcUserReward(stake, totalRewards, now);
  });
  res.json({ user_id, rewards_accrued: accrued });
});

// Redeem rewards for a user (reset accrued, add to redeemed)
router.post('/claim', async (req: Request, res: Response): Promise<void> => {
  const { user_id } = req.body;
  if (!user_id) {
    res.status(400).json({ error: 'Missing user_id' });
    return;
  }
  const now = Date.now();
  const totalRewards = DUMMYCONTRACT.getRewards();
  const userStakes = await Stake.find({ user_id, status: 'STAKED' });
  let accrued = 0;
  for (const stake of userStakes) {
    const reward = helpers.calcUserReward(stake, totalRewards, now);
    accrued += reward;
    const newTotalRedeemed = (stake.total_redeemed || 0) + reward;
    await Stake.update({ stake_id: stake.stake_id }, { last_claimed: now, total_redeemed: newTotalRedeemed });
  }
  redeemed[user_id] = (redeemed[user_id] || 0) + accrued;
  DUMMYCONTRACT.resetRewards();
  res.json({ success: true, claimed: accrued, total_redeemed: redeemed[user_id] });
});

// Simulate reward update (cron job)
router.post('/update', (_req: Request, res: Response) => {
  // Simulate accumulating rewards every call
  DUMMYCONTRACT.accumulateRewards(10); // Add 10 units per update
  res.json({ success: true, totalRewards: DUMMYCONTRACT.getRewards() });
});

export default router;
