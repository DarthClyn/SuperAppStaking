"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ledger = exports.Pool = exports.Stake = void 0;
exports.initializeTables = initializeTables;
// PostgreSQL models for staking backend
const connect_1 = require("./connect");
// Initialize tables
async function initializeTables() {
    await connect_1.pool.query(`
    CREATE TABLE IF NOT EXISTS stakes (
      id SERIAL PRIMARY KEY,
      stake_id INTEGER UNIQUE NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      token VARCHAR(50) NOT NULL,
      chain VARCHAR(50) NOT NULL,
      amount DECIMAL NOT NULL,
      staking_type VARCHAR(50) NOT NULL,
      pool_id BIGINT,
      start_time BIGINT NOT NULL,
      end_time BIGINT NOT NULL,
      apr DECIMAL NOT NULL,
      status VARCHAR(50) NOT NULL,
      reward_accumulated DECIMAL DEFAULT 0,
      reward_index INTEGER DEFAULT 0,
      last_claimed BIGINT,
      total_redeemed DECIMAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await connect_1.pool.query(`
    CREATE TABLE IF NOT EXISTS pools (
      id SERIAL PRIMARY KEY,
      pool_id BIGINT UNIQUE NOT NULL,
      total_amount DECIMAL NOT NULL,
      created BIGINT NOT NULL,
      tx_hash VARCHAR(255),
      staking_type VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
    await connect_1.pool.query(`
    CREATE TABLE IF NOT EXISTS ledger (
      id SERIAL PRIMARY KEY,
      stake_id INTEGER NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL,
      staking_type VARCHAR(50) NOT NULL,
      amount DECIMAL NOT NULL,
      requested_time BIGINT,
      staked_time BIGINT,
      start_timestamp BIGINT,
      end_timestamp BIGINT,
      apr DECIMAL,
      pool_id BIGINT,
      tx_hash VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
// Stake model
exports.Stake = {
    async create(data) {
        const result = await connect_1.pool.query(`INSERT INTO stakes (stake_id, user_id, token, chain, amount, staking_type, pool_id, start_time, end_time, apr, status, reward_accumulated, reward_index, last_claimed, total_redeemed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`, [data.stake_id, data.user_id, data.token, data.chain, data.amount, data.stakingType, data.pool_id, data.start_time, data.end_time, data.apr, data.status, data.rewardAccumulated || 0, data.reward_index || 0, data.lastClaimed || null, data.totalRedeemed || 0]);
        return result.rows[0];
    },
    async findOne(query) {
        const key = Object.keys(query)[0];
        const value = query[key];
        const result = await connect_1.pool.query(`SELECT * FROM stakes WHERE ${key} = $1 LIMIT 1`, [value]);
        return result.rows[0] || null;
    },
    async find(query = {}) {
        if (Object.keys(query).length === 0) {
            const result = await connect_1.pool.query('SELECT * FROM stakes');
            return result.rows;
        }
        const keys = Object.keys(query);
        const values = Object.values(query);
        const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
        const result = await connect_1.pool.query(`SELECT * FROM stakes WHERE ${whereClauses.join(' AND ')}`, values);
        return result.rows;
    },
    async update(query, updates) {
        const stake = await this.findOne(query);
        if (!stake)
            return null;
        const setKeys = Object.keys(updates);
        const setValues = Object.values(updates);
        const setClauses = setKeys.map((key, i) => `${key} = $${i + 1}`);
        const queryKey = Object.keys(query)[0];
        const result = await connect_1.pool.query(`UPDATE stakes SET ${setClauses.join(', ')} WHERE ${queryKey} = $${setKeys.length + 1} RETURNING *`, [...setValues, query[queryKey]]);
        return result.rows[0];
    },
    async deleteMany(query = {}) {
        if (Object.keys(query).length === 0) {
            await connect_1.pool.query('DELETE FROM stakes');
        }
        else {
            const keys = Object.keys(query);
            const values = Object.values(query);
            const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
            await connect_1.pool.query(`DELETE FROM stakes WHERE ${whereClauses.join(' AND ')}`, values);
        }
    },
    async save(stake) {
        const setKeys = Object.keys(stake).filter(k => k !== 'id' && k !== 'stake_id');
        const setValues = setKeys.map(k => stake[k]);
        const setClauses = setKeys.map((key, i) => `${key} = $${i + 1}`);
        const result = await connect_1.pool.query(`UPDATE stakes SET ${setClauses.join(', ')} WHERE stake_id = $${setKeys.length + 1} RETURNING *`, [...setValues, stake.stake_id]);
        return result.rows[0];
    }
};
// Pool model
exports.Pool = {
    async create(data) {
        const result = await connect_1.pool.query(`INSERT INTO pools (pool_id, total_amount, created, tx_hash, staking_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [data.pool_id, data.total_amount, data.created, data.txHash || null, data.stakingType]);
        return result.rows[0];
    },
    async find(query = {}) {
        if (Object.keys(query).length === 0) {
            const result = await connect_1.pool.query('SELECT * FROM pools');
            return result.rows;
        }
        const keys = Object.keys(query);
        const values = Object.values(query);
        const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
        const result = await connect_1.pool.query(`SELECT * FROM pools WHERE ${whereClauses.join(' AND ')}`, values);
        return result.rows;
    },
    async deleteMany(query = {}) {
        if (Object.keys(query).length === 0) {
            await connect_1.pool.query('DELETE FROM pools');
        }
        else {
            const keys = Object.keys(query);
            const values = Object.values(query);
            const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
            await connect_1.pool.query(`DELETE FROM pools WHERE ${whereClauses.join(' AND ')}`, values);
        }
    }
};
// Ledger model
exports.Ledger = {
    async create(data) {
        const result = await connect_1.pool.query(`INSERT INTO ledger (stake_id, user_id, status, staking_type, amount, requested_time, staked_time, start_timestamp, end_timestamp, apr, pool_id, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`, [data.stake_id, data.user_id, data.status, data.stakingType, data.amount, data.requested_time || null, data.staked_time || null, data.startTimestamp || null, data.endTimestamp || null, data.apr || null, data.pool_id || null, data.txHash || null]);
        return result.rows[0];
    },
    async find(query = {}) {
        if (Object.keys(query).length === 0) {
            const result = await connect_1.pool.query('SELECT * FROM ledger ORDER BY created_at DESC');
            return result.rows;
        }
        const keys = Object.keys(query);
        const values = Object.values(query);
        const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
        const result = await connect_1.pool.query(`SELECT * FROM ledger WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC`, values);
        return result.rows;
    },
    async deleteMany(query = {}) {
        if (Object.keys(query).length === 0) {
            await connect_1.pool.query('DELETE FROM ledger');
        }
        else {
            const keys = Object.keys(query);
            const values = Object.values(query);
            const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
            await connect_1.pool.query(`DELETE FROM ledger WHERE ${whereClauses.join(' AND ')}`, values);
        }
    }
};
//# sourceMappingURL=models.js.map