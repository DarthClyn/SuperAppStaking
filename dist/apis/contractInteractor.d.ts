export declare function verifyDeposit(_userAddress: string, _txHash: string): Promise<boolean>;
export declare function batchStake(_totalAmount: number, _lockPeriod: number): Promise<string>;
export declare function claimRewards(): Promise<string>;
export declare function distributeRewards(): Promise<void>;
export declare function unstake(_userId: string): Promise<string>;
//# sourceMappingURL=contractInteractor.d.ts.map