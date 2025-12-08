"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const models_1 = require("../database/models");
// 365 days = 30 min, so 1 month = 2.5 min, 3m = 7.5 min, 6m = 15 min, 12m = 30 min
const LOCK_PERIODS = {
    'flex': 0,
    '1m': 2.5 * 60,
    '3m': 7.5 * 60,
    '6m': 15 * 60,
    '12m': 30 * 60,
};
const APRS = {
    'flex': 10,
    '3m': 15,
    '6m': 18,
    '12m': 21,
};
const models_2 = require("../database/models");
let nextId = 1;
// Initialize nextId from database
async function initializeNextId() {
    const stakes = await models_2.Stake.find();
    if (stakes.length > 0) {
        const maxStakeId = Math.max(...stakes.map(s => s.stake_id));
        nextId = maxStakeId + 1;
    }
}
initializeNextId();
// Register stake request only, do not stake immediately
router.post('/', async (req, res) => {
    const { user_id, token, chain, amount, lock } = req.body;
    if (!user_id || !token || !chain || !amount || !lock || !(lock in LOCK_PERIODS)) {
        res.status(400).json({ error: 'Missing or invalid fields' });
        return;
    }
    const now = Date.now();
    const stakingType = lock;
    const apr = APRS[stakingType] || APRS['flex'];
    const lockSeconds = LOCK_PERIODS[stakingType];
    const stake = await models_2.Stake.create({
        stake_id: nextId++,
        user_id,
        token,
        chain,
        amount: parseFloat(amount),
        stakingType,
        pool_id: null,
        start_time: now,
        end_time: lockSeconds ? now + lockSeconds * 1000 : 0,
        apr,
        status: 'REQUESTED',
        rewardAccumulated: 0,
        reward_index: 0,
    });
    res.json({ success: true, stake });
});
router.get('/:id', async (req, res) => {
    const stake = await models_2.Stake.findOne({ stake_id: parseInt(req.params.id) });
    if (!stake) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(stake);
});
router.get('/', async (_req, res) => {
    const stakes = await models_2.Stake.find();
    res.json(stakes);
});
router.post('/unstake/:id', async (req, res) => {
    const stake = await models_2.Stake.findOne({ stake_id: parseInt(req.params.id) });
    if (!stake) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const now = Date.now();
    if (now < stake.end_time) {
        res.status(400).json({ error: 'Stake is still locked' });
        return;
    }
    await models_2.Stake.update({ stake_id: stake.stake_id }, { status: 'RELEASED' });
    // Log to ledger
    await models_1.Ledger.create({
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
exports.default = router;
//# sourceMappingURL=stake.js.map