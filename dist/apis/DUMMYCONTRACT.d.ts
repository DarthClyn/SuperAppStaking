import { TransactionResult } from '../types';
export declare function getMasterWallet(): string;
export declare function getStakingContract(): string;
export declare function stakeOnChain(user: string, amount: number): TransactionResult;
export declare function unstakeOnChain(user: string, amount: number): TransactionResult;
export declare function accumulateRewards(amount: number): number;
export declare function getRewards(): number;
export declare function getTransactionHash(): string;
export declare function getUserBalance(user: string): number;
export declare function resetRewards(): void;
//# sourceMappingURL=DUMMYCONTRACT.d.ts.map