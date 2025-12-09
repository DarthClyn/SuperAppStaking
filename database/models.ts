// ConfigSource model
export const ConfigSource = {
  async create(data: import('../types').ConfigSourceData): Promise<import('../types').ConfigSourceRow> {
    const result = await pool.query(
      `INSERT INTO config_sources (asset_id, source_type, endpoint_url, last_synced, config_json, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        data.asset_id,
        data.source_type,
        data.endpoint_url,
        data.last_synced || null,
        data.config_json || null,
        data.status || 'ACTIVE',
      ]
    );
    return result.rows[0];
  },

  async find(query: Record<string, any> = {}): Promise<import('../types').ConfigSourceRow[]> {
    if (Object.keys(query).length === 0) {
      const result = await pool.query('SELECT * FROM config_sources');
      return result.rows;
    }
    const keys = Object.keys(query);
    const values = Object.values(query);
    const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
    const result = await pool.query(`SELECT * FROM config_sources WHERE ${whereClauses.join(' AND ')}`, values);
    return result.rows;
  },

  async deleteMany(query: Record<string, any> = {}): Promise<void> {
    if (Object.keys(query).length === 0) {
      await pool.query('DELETE FROM config_sources');
    } else {
      const keys = Object.keys(query);
      const values = Object.values(query);
      const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
      await pool.query(`DELETE FROM config_sources WHERE ${whereClauses.join(' AND ')}`, values);
    }
  },
};
// PostgreSQL models for staking backend
import { pool } from './connect';
import {
  AssetData,
  AssetRow,
  StakingOfferData,
  StakingOfferRow,
  StakeData,
  StakeRow,
  PoolData,
  PoolRow,
  LedgerData,
  LedgerRow,
} from '../types';

// Initialize tables
export async function initializeTables(): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config_sources (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
        source_type VARCHAR(32) NOT NULL,
        endpoint_url VARCHAR(512) NOT NULL,
        last_synced BIGINT,
        config_json JSONB,
        status VARCHAR(32) DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(32) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      chain VARCHAR(64) NOT NULL,
      decimals INTEGER DEFAULT 18,
      min_amount DECIMAL DEFAULT 0,
      max_amount DECIMAL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS staking_offers (
      id SERIAL PRIMARY KEY,
      asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
      term_code VARCHAR(50) NOT NULL,
      lock_seconds BIGINT NOT NULL,
      apr DECIMAL NOT NULL,
      reward_payout_freq VARCHAR(50) DEFAULT 'DAILY',
      auto_renew_allowed BOOLEAN DEFAULT TRUE,
      early_unstake_allowed BOOLEAN DEFAULT FALSE,
      early_unstake_penalty DECIMAL DEFAULT 0,
      min_amount DECIMAL DEFAULT 0,
      max_amount DECIMAL,
      status VARCHAR(50) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asset_id, term_code)
    )
  `);

  await pool.query(`
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
      asset_id INTEGER,
      offer_id INTEGER,
      auto_renew BOOLEAN DEFAULT FALSE,
      reward_payout_freq VARCHAR(50) DEFAULT 'DAILY',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE stakes ADD COLUMN IF NOT EXISTS asset_id INTEGER`);
  await pool.query(`ALTER TABLE stakes ADD COLUMN IF NOT EXISTS offer_id INTEGER`);
  await pool.query(`ALTER TABLE stakes ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE stakes ADD COLUMN IF NOT EXISTS reward_payout_freq VARCHAR(50) DEFAULT 'DAILY'`);

  await pool.query(`
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

  await pool.query(`
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

  await seedDefaultEarnConfig();
}

async function seedDefaultEarnConfig(): Promise<void> {
  const assetUpsert = `
    INSERT INTO assets (symbol, name, chain, decimals, min_amount, max_amount, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (symbol) DO UPDATE SET
      name = EXCLUDED.name,
      chain = EXCLUDED.chain,
      decimals = EXCLUDED.decimals,
      min_amount = EXCLUDED.min_amount,
      max_amount = EXCLUDED.max_amount,
      is_active = EXCLUDED.is_active
    RETURNING *;
  `;

  const eth = await pool.query(assetUpsert, ['ETH', 'Ethereum', 'ETH', 18, 1, null, true]);
  const qrn = await pool.query(assetUpsert, ['QRN', 'Quranium', 'QRN', 18, 1, null, true]);

  const ethId = eth.rows[0].id;
  const qrnId = qrn.rows[0].id;

  const offerUpsert = `
    INSERT INTO staking_offers (asset_id, term_code, lock_seconds, apr, reward_payout_freq, auto_renew_allowed, early_unstake_allowed, early_unstake_penalty, min_amount, max_amount, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (asset_id, term_code) DO UPDATE SET
      lock_seconds = EXCLUDED.lock_seconds,
      apr = EXCLUDED.apr,
      reward_payout_freq = EXCLUDED.reward_payout_freq,
      auto_renew_allowed = EXCLUDED.auto_renew_allowed,
      early_unstake_allowed = EXCLUDED.early_unstake_allowed,
      early_unstake_penalty = EXCLUDED.early_unstake_penalty,
      min_amount = EXCLUDED.min_amount,
      max_amount = EXCLUDED.max_amount,
      status = EXCLUDED.status
    RETURNING *;
  `;

  const sixMonthSeconds = 15 * 60;
  await pool.query(offerUpsert, [ethId, '6m', sixMonthSeconds, 1.08, 'DAILY', true, false, 0, 1, null, 'ACTIVE']);
  await pool.query(offerUpsert, [qrnId, '6m', sixMonthSeconds, 1.08, 'DAILY', true, false, 0, 1, null, 'ACTIVE']);
}

// Stake model
export const Stake = {
  async create(data: StakeData): Promise<StakeRow> {
    const result = await pool.query(
      `INSERT INTO stakes (stake_id, user_id, token, chain, amount, staking_type, pool_id, start_time, end_time, apr, status, reward_accumulated, reward_index, last_claimed, total_redeemed, asset_id, offer_id, auto_renew, reward_payout_freq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
      [
        data.stake_id,
        data.user_id,
        data.token,
        data.chain,
        data.amount,
        data.stakingType,
        data.pool_id,
        data.start_time,
        data.end_time,
        data.apr,
        data.status,
        data.rewardAccumulated || 0,
        data.reward_index || 0,
        data.lastClaimed || null,
        data.totalRedeemed || 0,
        data.asset_id || null,
        data.offer_id || null,
        data.autoRenew ?? false,
        data.rewardPayoutFreq || 'DAILY',
      ]
    );
    return result.rows[0];
  },
  
  async findOne(query: Record<string, any>): Promise<StakeRow | null> {
    const key = Object.keys(query)[0];
    const value = query[key];
    const result = await pool.query(`SELECT * FROM stakes WHERE ${key} = $1 LIMIT 1`, [value]);
    return result.rows[0] || null;
  },
  
  async find(query: Record<string, any> = {}): Promise<StakeRow[]> {
    if (Object.keys(query).length === 0) {
      const result = await pool.query('SELECT * FROM stakes');
      return result.rows;
    }
    const keys = Object.keys(query);
    const values = Object.values(query);
    const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
    const result = await pool.query(`SELECT * FROM stakes WHERE ${whereClauses.join(' AND ')}`, values);
    return result.rows;
  },
  
  async update(query: Record<string, any>, updates: Record<string, any>): Promise<StakeRow | null> {
    const stake = await this.findOne(query);
    if (!stake) return null;
    const setKeys = Object.keys(updates);
    const setValues = Object.values(updates);
    const setClauses = setKeys.map((key, i) => `${key} = $${i + 1}`);
    const queryKey = Object.keys(query)[0];
    const result = await pool.query(
      `UPDATE stakes SET ${setClauses.join(', ')} WHERE ${queryKey} = $${setKeys.length + 1} RETURNING *`,
      [...setValues, query[queryKey]]
    );
    return result.rows[0];
  },
  
  async deleteMany(query: Record<string, any> = {}): Promise<void> {
    if (Object.keys(query).length === 0) {
      await pool.query('DELETE FROM stakes');
    } else {
      const keys = Object.keys(query);
      const values = Object.values(query);
      const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
      await pool.query(`DELETE FROM stakes WHERE ${whereClauses.join(' AND ')}`, values);
    }
  },
  
  async save(stake: StakeRow): Promise<StakeRow> {
    const setKeys = Object.keys(stake).filter(k => k !== 'id' && k !== 'stake_id');
    const setValues = setKeys.map(k => (stake as any)[k]);
    const setClauses = setKeys.map((key, i) => `${key} = $${i + 1}`);
    const result = await pool.query(
      `UPDATE stakes SET ${setClauses.join(', ')} WHERE stake_id = $${setKeys.length + 1} RETURNING *`,
      [...setValues, stake.stake_id]
    );
    return result.rows[0];
  }
};

// Pool model
export const Pool = {
  async create(data: PoolData): Promise<PoolRow> {
    const result = await pool.query(
      `INSERT INTO pools (pool_id, total_amount, created, tx_hash, staking_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.pool_id, data.total_amount, data.created, data.txHash || null, data.stakingType]
    );
    return result.rows[0];
  },
  
  async find(query: Record<string, any> = {}): Promise<PoolRow[]> {
    if (Object.keys(query).length === 0) {
      const result = await pool.query('SELECT * FROM pools');
      return result.rows;
    }
    const keys = Object.keys(query);
    const values = Object.values(query);
    const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
    const result = await pool.query(`SELECT * FROM pools WHERE ${whereClauses.join(' AND ')}`, values);
    return result.rows;
  },
  
  async deleteMany(query: Record<string, any> = {}): Promise<void> {
    if (Object.keys(query).length === 0) {
      await pool.query('DELETE FROM pools');
    } else {
      const keys = Object.keys(query);
      const values = Object.values(query);
      const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
      await pool.query(`DELETE FROM pools WHERE ${whereClauses.join(' AND ')}`, values);
    }
  }
};

// Ledger model
export const Ledger = {
  async create(data: LedgerData): Promise<LedgerRow> {
    const result = await pool.query(
      `INSERT INTO ledger (stake_id, user_id, status, staking_type, amount, requested_time, staked_time, start_timestamp, end_timestamp, apr, pool_id, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [data.stake_id, data.user_id, data.status, data.stakingType, data.amount, data.requested_time || null, data.staked_time || null, data.startTimestamp || null, data.endTimestamp || null, data.apr || null, data.pool_id || null, data.txHash || null]
    );
    return result.rows[0];
  },
  
  async find(query: Record<string, any> = {}): Promise<LedgerRow[]> {
    if (Object.keys(query).length === 0) {
      const result = await pool.query('SELECT * FROM ledger ORDER BY created_at DESC');
      return result.rows;
    }
    const keys = Object.keys(query);
    const values = Object.values(query);
    const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
    const result = await pool.query(`SELECT * FROM ledger WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC`, values);
    return result.rows;
  },
  
  async deleteMany(query: Record<string, any> = {}): Promise<void> {
    if (Object.keys(query).length === 0) {
      await pool.query('DELETE FROM ledger');
    } else {
      const keys = Object.keys(query);
      const values = Object.values(query);
      const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
      await pool.query(`DELETE FROM ledger WHERE ${whereClauses.join(' AND ')}`, values);
    }
  }
};

// Asset model
export const Asset = {
  async create(data: AssetData): Promise<AssetRow> {
    const result = await pool.query(
      `INSERT INTO assets (symbol, name, chain, decimals, min_amount, max_amount, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (symbol) DO UPDATE SET
         name = EXCLUDED.name,
         chain = EXCLUDED.chain,
         decimals = EXCLUDED.decimals,
         min_amount = EXCLUDED.min_amount,
         max_amount = EXCLUDED.max_amount,
         is_active = EXCLUDED.is_active
       RETURNING *`,
      [data.symbol, data.name, data.chain, data.decimals || 18, data.min_amount || 0, data.max_amount || null, data.is_active ?? true]
    );
    return result.rows[0];
  },

  async find(query: Record<string, any> = {}): Promise<AssetRow[]> {
    if (Object.keys(query).length === 0) {
      const result = await pool.query('SELECT * FROM assets');
      return result.rows;
    }
    const keys = Object.keys(query);
    const values = Object.values(query);
    const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
    const result = await pool.query(`SELECT * FROM assets WHERE ${whereClauses.join(' AND ')}`, values);
    return result.rows;
  },

  async deleteMany(query: Record<string, any> = {}): Promise<void> {
    if (Object.keys(query).length === 0) {
      await pool.query('DELETE FROM assets');
    } else {
      const keys = Object.keys(query);
      const values = Object.values(query);
      const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
      await pool.query(`DELETE FROM assets WHERE ${whereClauses.join(' AND ')}`, values);
    }
  },
};

// Staking offer model
export const StakingOffer = {
  async create(data: StakingOfferData): Promise<StakingOfferRow> {
    const result = await pool.query(
      `INSERT INTO staking_offers (asset_id, term_code, lock_seconds, apr, reward_payout_freq, auto_renew_allowed, early_unstake_allowed, early_unstake_penalty, min_amount, max_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (asset_id, term_code) DO UPDATE SET
         lock_seconds = EXCLUDED.lock_seconds,
         apr = EXCLUDED.apr,
         reward_payout_freq = EXCLUDED.reward_payout_freq,
         auto_renew_allowed = EXCLUDED.auto_renew_allowed,
         early_unstake_allowed = EXCLUDED.early_unstake_allowed,
         early_unstake_penalty = EXCLUDED.early_unstake_penalty,
         min_amount = EXCLUDED.min_amount,
         max_amount = EXCLUDED.max_amount,
         status = EXCLUDED.status
       RETURNING *`,
      [
        data.asset_id,
        data.term_code,
        data.lock_seconds,
        data.apr,
        data.reward_payout_freq || 'DAILY',
        data.auto_renew_allowed ?? true,
        data.early_unstake_allowed ?? false,
        data.early_unstake_penalty ?? 0,
        data.min_amount || 0,
        data.max_amount || null,
        data.status || 'ACTIVE',
      ]
    );
    return result.rows[0];
  },

  async find(query: Record<string, any> = {}): Promise<StakingOfferRow[]> {
    if (Object.keys(query).length === 0) {
      const result = await pool.query('SELECT * FROM staking_offers');
      return result.rows;
    }
    const keys = Object.keys(query);
    const values = Object.values(query);
    const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
    const result = await pool.query(`SELECT * FROM staking_offers WHERE ${whereClauses.join(' AND ')}`, values);
    return result.rows;
  },

  async deleteMany(query: Record<string, any> = {}): Promise<void> {
    if (Object.keys(query).length === 0) {
      await pool.query('DELETE FROM staking_offers');
    } else {
      const keys = Object.keys(query);
      const values = Object.values(query);
      const whereClauses = keys.map((key, i) => `${key} = $${i + 1}`);
      await pool.query(`DELETE FROM staking_offers WHERE ${whereClauses.join(' AND ')}`, values);
    }
  },
};
