"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Main Express server for staking API
const express_1 = __importDefault(require("express"));
const stake_1 = __importDefault(require("./stake"));
const rewards_1 = __importDefault(require("./rewards"));
const pool_1 = __importDefault(require("./pool"));
const ledger_1 = __importDefault(require("./ledger"));
const models_1 = require("../database/models");
const connect_1 = require("../database/connect");
// PostgreSQL connection
(0, connect_1.connectDB)().then(async () => {
    console.log('PostgreSQL connected');
    await (0, models_1.initializeTables)();
    console.log('Tables initialized');
}).catch(err => {
    console.error('PostgreSQL connection error:', err);
});
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use('/stake', stake_1.default);
app.use('/rewards', rewards_1.default);
app.use('/pool', pool_1.default);
app.use('/ledger', ledger_1.default);
app.get('/', (_req, res) => {
    res.send('User-side staking API is running');
});
// Admin endpoint to clear database
app.post('/admin/clear-database', async (_req, res) => {
    try {
        await models_1.Stake.deleteMany({});
        await models_1.Pool.deleteMany({});
        await models_1.Ledger.deleteMany({});
        res.json({ success: true, message: 'Database cleared successfully' });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`User-side staking API server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map