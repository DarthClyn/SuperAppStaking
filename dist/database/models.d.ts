import { StakeData, StakeRow, PoolData, PoolRow, LedgerData, LedgerRow } from '../types';
export declare function initializeTables(): Promise<void>;
export declare const Stake: {
    create(data: StakeData): Promise<StakeRow>;
    findOne(query: Record<string, any>): Promise<StakeRow | null>;
    find(query?: Record<string, any>): Promise<StakeRow[]>;
    update(query: Record<string, any>, updates: Record<string, any>): Promise<StakeRow | null>;
    deleteMany(query?: Record<string, any>): Promise<void>;
    save(stake: StakeRow): Promise<StakeRow>;
};
export declare const Pool: {
    create(data: PoolData): Promise<PoolRow>;
    find(query?: Record<string, any>): Promise<PoolRow[]>;
    deleteMany(query?: Record<string, any>): Promise<void>;
};
export declare const Ledger: {
    create(data: LedgerData): Promise<LedgerRow>;
    find(query?: Record<string, any>): Promise<LedgerRow[]>;
    deleteMany(query?: Record<string, any>): Promise<void>;
};
//# sourceMappingURL=models.d.ts.map