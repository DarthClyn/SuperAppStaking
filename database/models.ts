// database/model.ts
import { pool } from './connect';

export async function initializeTables(): Promise<void> {
  // 1. Users (Floating Balance)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      wallet_address VARCHAR(42) PRIMARY KEY,
      available_balance_wei NUMERIC(78,0) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 2. Tiers (7 Days, 30 Days)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tiers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50),
      duration_days DECIMAL(10, 6),
      apr_percentage DECIMAL(5, 2),
      -- Waiting period in seconds before requested stakes are evaluated
      waiting_period_seconds INT DEFAULT 604800,
      -- Activation threshold in wei for the pooled stakes of this tier
      activation_threshold_wei NUMERIC(78,0) DEFAULT 32000000000000000
    )
  `);

  // 3. Stakes (Active Locks)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stakes (
      id SERIAL PRIMARY KEY,
      user_address VARCHAR(42) REFERENCES users(wallet_address),
      tier_id INT REFERENCES tiers(id),
      amount_wei NUMERIC(78,0) NOT NULL,
      -- requested_at: when user created the stake request (waiting period starts)
      requested_at TIMESTAMP DEFAULT NOW(),
      -- start_time: when stake became ACTIVE (NULL while REQUESTED)
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      projected_reward_wei NUMERIC(78,0)
    )
  `);

  // 4. Transactions (History)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      tx_hash VARCHAR(66),
      user_address VARCHAR(42),
      type VARCHAR(20),
      amount_wei NUMERIC(78,0),
      timestamp TIMESTAMP DEFAULT NOW()
    )
  `);

  // Seed Tiers if empty
  const tierCheck = await pool.query('SELECT * FROM tiers');
  if (tierCheck.rows.length === 0) {
    await pool.query(`INSERT INTO tiers (name, duration_days, apr_percentage, waiting_period_seconds, activation_threshold_wei) VALUES 
      ('Short Term', 7, 0.50, 604800, 32000000000000000),
      ('Long Term', 30, 2.16, 604800, 32000000000000000),
      ('TESTING', 0.001388, 10.00, 180, 32000000000000000)`
    );
      
    console.log('Seeded Tiers');
  }
}

// Export raw pool for queries in API
export { pool };