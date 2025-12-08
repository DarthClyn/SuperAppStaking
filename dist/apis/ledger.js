"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Internal ledger API
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const models_1 = require("../database/models");
router.get('/', async (_req, res) => {
    const entries = await models_1.Ledger.find();
    res.json(entries);
});
router.post('/add', async (req, res) => {
    const entry = await models_1.Ledger.create(req.body);
    res.json({ success: true, entry });
});
exports.default = router;
//# sourceMappingURL=ledger.js.map