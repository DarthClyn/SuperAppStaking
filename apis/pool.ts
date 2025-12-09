// Pool logic API
import express, { Request, Response } from 'express';
const router = express.Router();

import { Pool, Stake, Ledger, Asset, StakingOffer } from '../database/models';
import { batchStake } from './contractInteractor';

const POOL_THRESHOLD_ETH = 10; // testing

async function getTotalPendingAmount(stakingType: string): Promise<number> {
  const pending = await Stake.find({ staking_type: stakingType, status: 'REQUESTED' });
  return pending.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0);
}

async function flushPool(stakingType: string) {
  const stakesForType = await Stake.find({ staking_type: stakingType, status: 'REQUESTED' });
  const totalAmount = stakesForType.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0);
  if (totalAmount >= POOL_THRESHOLD_ETH) {
    // Get offer config for lock period
    const offer = stakesForType.length > 0 && stakesForType[0].offer_id ? (await StakingOffer.find({ id: stakesForType[0].offer_id }))[0] : null;
    const lockPeriod = offer ? offer.lock_seconds : 0;
    // Call contractInteractor for batch staking
    const txHash = await batchStake(totalAmount, lockPeriod);
    const pool = await Pool.create({
      pool_id: Date.now(),
      total_amount: totalAmount,
      created: Date.now(),
      txHash,
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
        txHash
      });
    }
    return { txHash };
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
  const { user_id, amount, stakingType, stake_id, start_time, end_time, apr, offer_id, asset_id } = req.body;
  if (!user_id || !amount || !stakingType || !offer_id || !asset_id) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }
  // Fetch offer and asset config
  const offer = (await StakingOffer.find({ id: offer_id }))[0];
  const asset = (await Asset.find({ id: asset_id }))[0];
  if (!offer || !asset) {
    res.status(400).json({ error: 'Invalid offer or asset' });
    return;
  }
  const numericAmount = parseFloat(amount);
  if (Number.isNaN(numericAmount) || numericAmount < offer.min_amount || numericAmount < asset.min_amount) {
    res.status(400).json({ error: `Amount must be at least ${Math.max(offer.min_amount, asset.min_amount)}` });
    return;
  }
  if ((offer.max_amount && numericAmount > offer.max_amount) || (asset.max_amount && numericAmount > asset.max_amount)) {
    res.status(400).json({ error: `Amount must not exceed ${Math.min(offer.max_amount || Infinity, asset.max_amount || Infinity)}` });
    return;
  }
  // Mark ledger as requested
  await Ledger.create({
    stake_id,
    user_id,
    status: 'REQUESTED',
    stakingType,
    amount: numericAmount,
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

// Public: list offers for an asset symbol
router.get('/offers/:symbol', async (req: Request, res: Response) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }
  const assets = await Asset.find({ symbol });
  if (!assets || assets.length === 0) {
    res.json({ offers: [] });
    return;
  }
  const asset = assets[0];
  const offers = await StakingOffer.find({ asset_id: asset.id, status: 'ACTIVE' });
  res.json({ offers });
});


// Sync config_sources from external APIs/contracts
router.post('/config/sync', async (req: Request, res: Response) => {
  // Example: fetch all config_sources and update last_synced/config_json
  const configs = await ConfigSource.find();
  for (const config of configs) {
    // Simulate external fetch (replace with real API/contract call)
    const externalConfig = { fetched: true, timestamp: Date.now() };
    await ConfigSource.create({
      ...config,
      last_synced: Date.now(),
      config_json: externalConfig,
      status: 'ACTIVE',
    });
  }
  res.json({ success: true, updated: configs.length });
});

export default router;
