"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Pool logic API
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const models_1 = require("../database/models");
const DUMMYCONTRACT = __importStar(require("./DUMMYCONTRACT"));
const POOL_THRESHOLD_ETH = 10; // testing
async function getTotalPendingAmount(stakingType) {
    const pending = await models_1.Stake.find({ staking_type: stakingType, status: 'REQUESTED' });
    return pending.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0);
}
async function flushPool(stakingType) {
    const stakesForType = await models_1.Stake.find({ staking_type: stakingType, status: 'REQUESTED' });
    const totalAmount = stakesForType.reduce((sum, s) => sum + parseFloat(s.amount.toString()), 0);
    if (totalAmount >= POOL_THRESHOLD_ETH) {
        const tx = DUMMYCONTRACT.stakeOnChain('masterWallet', totalAmount);
        const pool = await models_1.Pool.create({
            pool_id: Date.now(),
            total_amount: totalAmount,
            created: Date.now(),
            txHash: tx.txHash,
            stakingType,
        });
        for (const stake of stakesForType) {
            await models_1.Stake.update({ stake_id: stake.stake_id }, { status: 'STAKED', pool_id: pool.pool_id });
            await models_1.Ledger.create({
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
                txHash: tx.txHash
            });
        }
        return tx;
    }
    return null;
}
// Get all pools
router.get('/', async (_req, res) => {
    const pools = await models_1.Pool.find();
    const pendingStakes = await models_1.Stake.find({ status: 'REQUESTED' });
    const pendingByType = {};
    pendingStakes.forEach(s => {
        if (!pendingByType[s.staking_type])
            pendingByType[s.staking_type] = [];
        pendingByType[s.staking_type].push(s);
    });
    res.json({ pools, pendingStakes, pendingByType });
});
// Add a stake to the pending pool
router.post('/addStake', async (req, res) => {
    const { user_id, amount, stakingType, stake_id, start_time, end_time, apr } = req.body;
    if (!user_id || !amount || !stakingType) {
        res.status(400).json({ error: 'Missing fields' });
        return;
    }
    // Mark ledger as requested
    await models_1.Ledger.create({
        stake_id,
        user_id,
        status: 'REQUESTED',
        stakingType,
        amount: parseFloat(amount),
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
router.post('/flush', async (req, res) => {
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
exports.default = router;
//# sourceMappingURL=pool.js.map