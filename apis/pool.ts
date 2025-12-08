// Pool logic API
import express, { Request, Response } from 'express';
const router = express.Router();

import { Pool, Stake, Ledger } from '../database/models';
import * as DUMMYCONTRACT from './DUMMYCONTRACT';

const POOL_THRESHOLD_ETH = 10; // testing

async function getTotalPendingAmount(stakingType: string): Promise<number> {
  const pending = await Stake.find({ staking_type: stakingType, status: 'REQUESTED' });
  return pending.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0);
}

async function flushPool(stakingType: string) {
  const stakesForType = await Stake.find({ staking_type: stakingType, status: 'REQUESTED' });
  const totalAmount = stakesForType.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0);
  if (totalAmount >= POOL_THRESHOLD_ETH) {
    const tx = DUMMYCONTRACT.stakeOnChain('masterWallet', totalAmount);
    const pool = await Pool.create({
      pool_id: Date.now(),
      total_amount: totalAmount,
      created: Date.now(),
      txHash: tx.txHash,
      stakingType,
    });
    for (const stake of stakesForType) {
      await Stake.update({ stake_id: stake.stake_id }, { status: 'STAKED', pool_id: pool.pool_id });
      await Ledger.create({
        stake_id: stake.stake_id,
        user_id: stake.user_id,
        status: 'STAKED',
        stakingType: stake.staking_type,
        amount: parseFloat(stake.amount.toString()),
        pool_id: pool.pool_id,
        staked_time: Date.now(),
        startTimestamp: stake.start_time,
        endTimestamp: stake.end_time,
        apr: parseFloat(stake.apr.toString()),
        txHash: tx.txHash
      });
    }
    return tx;
  }
  return null;
}

// Get all pools
router.get('/', async (_req: Request, res: Response) => {
  const pools = await Pool.find();
  const pendingStakes = await Stake.find({ status: 'REQUESTED' });
  const pendingByType: { [key: string]: any[] } = {};
  pendingStakes.forEach(s => {
    if (!pendingByType[s.staking_type]) pendingByType[s.staking_type] = [];
    pendingByType[s.staking_type].push(s);
  });
  res.json({ pools, pendingStakes, pendingByType });
});

// Add a stake to the pending pool
router.post('/addStake', async (req: Request, res: Response): Promise<void> => {
  const { user_id, amount, stakingType, stake_id, start_time, end_time, apr } = req.body;
  if (!user_id || !amount || !stakingType) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }
  // Mark ledger as requested
  await Ledger.create({
    stake_id,
    user_id,
    status: 'REQUESTED',
    stakingType,
    amount: parseFloat(amount),
    requested_time: Date.now(),
    startTimestamp: start_time,
    endTimestamp: end_time,
    apr: parseFloat(apr)
  });
  const tx = await flushPool(stakingType);
  const totalPending = await getTotalPendingAmount(stakingType);
  if (tx) {
    res.json({ success: true, pooled: true, tx });
    return;
  }
  res.json({ success: true, pooled: false, totalPending });
});

// Manually flush pool for a lock period
router.post('/flush', async (req: Request, res: Response): Promise<void> => {
  const { stakingType } = req.body;
  if (!stakingType) {
    res.status(400).json({ error: 'Missing stakingType' });
    return;
  }
  const tx = await flushPool(stakingType);
  const totalPending = await getTotalPendingAmount(stakingType);
  if (tx) {
    res.json({ success: true, pooled: true, tx });
    return;
  }
  res.json({ success: false, pooled: false, totalPending });
});

export default router;
