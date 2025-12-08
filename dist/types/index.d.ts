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
}
export interface StakeRow extends StakeData {
    id: number;
    staking_type: string;
    reward_accumulated: number;
    reward_index: number;
    last_claimed: number | null;
    total_redeemed: number;
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
//# sourceMappingURL=index.d.ts.map