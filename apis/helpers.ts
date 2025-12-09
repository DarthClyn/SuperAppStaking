// Helper functions for formatting and chain logic
import { StakeRow } from '../types';

// For fast testing: 365 days = 30 minutes
export const TEST_YEAR_SECONDS = 30 * 60; // 30 minutes as 1 year
export const TEST_DAY_SECONDS = TEST_YEAR_SECONDS / 365; // 1 day = ~4.93 seconds

export function formatAmount(amt: number): string {
  return `${amt} ETH`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toISOString();
}

export function calcUserReward(stake: StakeRow, now: number = Date.now()): number {
  // Calculate seconds staked since lastClaimed
  const since = (stake.last_claimed as any) || stake.start_time;

  // For fixed-term stakes, cap reward calculation at end_time
  let rewardEndTime = now;
  if (stake.end_time && stake.end_time > 0) {
    rewardEndTime = Math.min(now, stake.end_time);
  }

  const secondsStaked = Math.floor((rewardEndTime - since) / 1000);
  if (secondsStaked <= 0) return 0;

  const daysStaked = secondsStaked / TEST_DAY_SECONDS;
  const apy = parseFloat((stake.apr as any).toString());
  const principal = parseFloat((stake.amount as any).toString());
  const annualReward = (principal * apy) / 100;
  const proportionalReward = (annualReward * daysStaked) / 365;
  return proportionalReward;
}
