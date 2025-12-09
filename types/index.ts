export interface ConfigSourceData {
  asset_id: number;
  source_type: string; // 'api', 'contract', etc.
  endpoint_url: string;
  last_synced?: number;
  config_json?: any;
  status?: string;
}

export interface ConfigSourceRow extends ConfigSourceData {
  id: number;
  last_synced: number | null;
  config_json: any;
  status: string;
  created_at: Date;
}
// Type definitions for the staking system

export interface AssetData {
  symbol: string;
  name: string;
  chain: string;
  decimals?: number;
  min_amount?: number;
  max_amount?: number | null;
  is_active?: boolean;
}

export interface AssetRow extends AssetData {
  id: number;
  decimals: number;
  min_amount: number;
  max_amount: number | null;
  is_active: boolean;
  created_at: Date;
}

export interface StakingOfferData {
  asset_id: number;
  term_code: string; // e.g., '6m'
  lock_seconds: number;
  apr: number;
  reward_payout_freq?: string; // e.g., 'DAILY'
  auto_renew_allowed?: boolean;
  early_unstake_allowed?: boolean;
  early_unstake_penalty?: number;
  min_amount?: number;
  max_amount?: number | null;
  status?: string;
}

export interface StakingOfferRow extends StakingOfferData {
  id: number;
  reward_payout_freq: string;
  auto_renew_allowed: boolean;
  early_unstake_allowed: boolean;
  early_unstake_penalty: number;
  min_amount: number;
  max_amount: number | null;
  status: string;
  created_at: Date;
}

export interface StakeData {
  stake_id: number;
  user_id: string;
  token: string;
  chain: string;
  amount: number;
  stakingType: string;
  pool_id: number | null;
  start_time: number;
  end_time: number;
  apr: number;
  status: 'REQUESTED' | 'STAKED' | 'RELEASED';
  rewardAccumulated?: number;
  reward_index?: number;
  lastClaimed?: number | null;
  totalRedeemed?: number;
  asset_id?: number | null;
  offer_id?: number | null;
  autoRenew?: boolean;
  rewardPayoutFreq?: string;
}

export interface StakeRow extends StakeData {
  id: number;
  staking_type: string;
  reward_accumulated: number;
  reward_index: number;
  last_claimed: number | null;
  total_redeemed: number;
  auto_renew: boolean;
  reward_payout_freq: string;
  created_at: Date;
}

export interface PoolData {
  pool_id: number;
  total_amount: number;
  created: number;
  txHash?: string;
  stakingType: string;
}

export interface PoolRow extends PoolData {
  id: number;
  tx_hash: string | null;
  staking_type: string;
  created_at: Date;
}

export interface LedgerData {
  stake_id: number;
  user_id: string;
  status: string;
  stakingType: string;
  amount: number;
  requested_time?: number;
  staked_time?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  apr?: number;
  pool_id?: number | null;
  txHash?: string;
}

export interface LedgerRow extends Omit<LedgerData, 'requested_time' | 'staked_time' | 'startTimestamp' | 'endTimestamp' | 'txHash'> {
  id: number;
  staking_type: string;
  requested_time: number | null;
  staked_time: number | null;
  start_timestamp: number | null;
  end_timestamp: number | null;
  tx_hash: string | null;
  created_at: Date;
}

export interface TransactionResult {
  txHash: string;
  user: string;
  amount: number;
  stakedTotal: number;
}

export interface LockPeriods {
  [key: string]: number;
}

export interface APRs {
  [key: string]: number;
}
