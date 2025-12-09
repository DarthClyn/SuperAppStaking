import express, { Request, Response } from 'express';
const router = express.Router();

import * as helpers from './helpers';
import { Stake, StakingOffer, Asset } from '../database/models';

// Simple in-memory redeemed totals (persist elsewhere if needed)
const redeemed: { [key: string]: number } = {};

// Get current rewards for a user (sum all active stakes)
  const user_id = req.params.user_id;
  const now = Date.now();
  const userStakes = await Stake.find({ user_id, status: 'STAKED' });
  let accrued = 0;
  const detailedRewards = [];
  for (const stake of userStakes) {
    // Fetch offer and asset for config-driven calculation
    const offer = stake.offer_id ? (await StakingOffer.find({ id: stake.offer_id }))[0] : null;
    const asset = stake.asset_id ? (await Asset.find({ id: stake.asset_id }))[0] : null;
    // Use offer config for APR, payout freq, etc.
    const apr = offer ? parseFloat(offer.apr.toString()) : parseFloat(stake.apr.toString());
    const rewardPayoutFreq = offer ? offer.reward_payout_freq : stake.reward_payout_freq;
    const minAmount = offer ? offer.min_amount : 0;
    const maxAmount = offer ? offer.max_amount : null;
    // Enforce min/max validation
    if (stake.amount < minAmount || (maxAmount && stake.amount > maxAmount)) continue;
    // Calculate reward using config
    const reward = helpers.calcUserReward({ ...stake, apr, reward_payout_freq: rewardPayoutFreq }, now);
    accrued += reward;
    detailedRewards.push({ stake_id: stake.stake_id, asset: asset ? asset.symbol : stake.token, offer_id: stake.offer_id, reward });
  }
  res.json({ user_id, rewards_accrued: accrued, detailedRewards });
});

// Redeem rewards for a user (calculate from DB, update stake last_claimed)
  const { user_id } = req.body;
  if (!user_id) {
    res.status(400).json({ error: 'Missing user_id' });
    return;
  }
  const now = Date.now();
  const userStakes = await Stake.find({ user_id, status: 'STAKED' });
  let accrued = 0;
  const claimedDetails = [];
  for (const stake of userStakes) {
    // Fetch offer for config-driven calculation
    const offer = stake.offer_id ? (await StakingOffer.find({ id: stake.offer_id }))[0] : null;
    const apr = offer ? parseFloat(offer.apr.toString()) : parseFloat(stake.apr.toString());
    const rewardPayoutFreq = offer ? offer.reward_payout_freq : stake.reward_payout_freq;
    const minAmount = offer ? offer.min_amount : 0;
    const maxAmount = offer ? offer.max_amount : null;
    if (stake.amount < minAmount || (maxAmount && stake.amount > maxAmount)) continue;
    // Calculate reward using config
    const reward = helpers.calcUserReward({ ...stake, apr, reward_payout_freq: rewardPayoutFreq }, now);
    if (reward > 0) {
      accrued += reward;
      const newTotalRedeemed = (stake.total_redeemed || 0) + reward;
      await Stake.update({ stake_id: stake.stake_id }, { last_claimed: now, total_redeemed: newTotalRedeemed });
      claimedDetails.push({ stake_id: stake.stake_id, offer_id: stake.offer_id, claimed: reward });
    }
  }
  redeemed[user_id] = (redeemed[user_id] || 0) + accrued;
  res.json({ success: true, claimed: accrued, total_redeemed: redeemed[user_id], claimedDetails });
});

// No-op update endpoint (rewards are computed on demand from DB)
router.post('/update', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Rewards are computed from DB; no cron simulation required' });
});

export default router;
