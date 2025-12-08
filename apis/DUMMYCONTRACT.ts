// Dummy contract simulation with internal state
import { TransactionResult } from '../types';

interface ContractState {
  masterWallet: string;
  stakingContract: string;
  stakedAmount: number;
  rewardsPool: number;
  txCount: number;
  userBalances: { [key: string]: number };
}

const state: ContractState = {
  masterWallet: '0xMASTERWALLET',
  stakingContract: '0xSTAKINGCONTRACT',
  stakedAmount: 0,
  rewardsPool: 0,
  txCount: 0,
  userBalances: {},
};

export function getMasterWallet(): string {
  return state.masterWallet;
}

export function getStakingContract(): string {
  return state.stakingContract;
}

export function stakeOnChain(user: string, amount: number): TransactionResult {
  state.stakedAmount += amount;
  state.userBalances[user] = (state.userBalances[user] || 0) + amount;
  state.txCount++;
  return {
    txHash: `0xTXHASH${state.txCount}`,
    user,
    amount,
    stakedTotal: state.stakedAmount,
  };
}

export function unstakeOnChain(user: string, amount: number): TransactionResult {
  state.stakedAmount -= amount;
  state.userBalances[user] = Math.max(0, (state.userBalances[user] || 0) - amount);
  state.txCount++;
  return {
    txHash: `0xTXHASH${state.txCount}`,
    user,
    amount,
    stakedTotal: state.stakedAmount,
  };
}

export function accumulateRewards(amount: number): number {
  state.rewardsPool += amount;
  return state.rewardsPool;
}

export function getRewards(): number {
  return state.rewardsPool;
}

export function getTransactionHash(): string {
  return `0xTXHASH${state.txCount}`;
}

export function getUserBalance(user: string): number {
  return state.userBalances[user] || 0;
}

export function resetRewards(): void {
  state.rewardsPool = 0;
}
