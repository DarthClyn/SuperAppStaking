import express, { Request, Response } from 'express';
const router = express.Router();

import { Ledger, Stake, Asset, StakingOffer, ConfigSource } from '../database/models';
import { LockPeriods, APRs } from '../types';

// Remove hardcoded periods/APRs; use config table and/or external config
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
  const { user_id, token, chain, amount, offer_id } = req.body;

  if (!user_id || !token || !chain || amount === undefined || amount === null || !offer_id) {
    res.status(400).json({ error: 'Missing required fields: user_id, token, chain, amount, offer_id' });
    return;
  }

  const symbol = String(token).toUpperCase();
  const assetRows = await Asset.find({ symbol });
  let asset = assetRows[0];
  if (!asset) {
    res.status(400).json({ error: `Asset ${symbol} not found` });
    return;
  }

  const offers = await StakingOffer.find({ id: offer_id, asset_id: asset.id, status: 'ACTIVE' });
  if (!offers || offers.length === 0) {
    res.status(400).json({ error: `No active offer for ${symbol} and offer_id ${offer_id}` });
    return;
  }
  const offer = offers[0];

  // Enforce min/max from offer config
  const numericAmount = parseFloat(amount);
  if (Number.isNaN(numericAmount) || numericAmount < offer.min_amount) {
    res.status(400).json({ error: `Amount must be at least ${offer.min_amount}` });
    return;
  }
  if (offer.max_amount && numericAmount > offer.max_amount) {
    res.status(400).json({ error: `Amount must not exceed ${offer.max_amount}` });
    return;
  }

  const now = Date.now();
  const end_time = offer.lock_seconds ? now + offer.lock_seconds * 1000 : 0;
  const stake = await Stake.create({
    stake_id: nextId++,
    user_id,
    token: symbol,
    chain,
    amount: numericAmount,
    stakingType: offer.term_code,
    pool_id: null,
    start_time: now,
    end_time,
    apr: parseFloat(offer.apr.toString()),
    status: 'REQUESTED',
    rewardAccumulated: 0,
    reward_index: 0,
    asset_id: asset.id,
    offer_id: offer.id,
    autoRenew: false, // always false for now
    rewardPayoutFreq: offer.reward_payout_freq,
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
