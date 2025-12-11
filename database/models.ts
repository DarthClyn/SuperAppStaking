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
      apr_percentage DECIMAL(5, 2)
    )
  `);

  // 3. Stakes (Active Locks)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stakes (
      id SERIAL PRIMARY KEY,
      user_address VARCHAR(42) REFERENCES users(wallet_address),
      tier_id INT REFERENCES tiers(id),
      amount_wei NUMERIC(78,0) NOT NULL,
      start_time TIMESTAMP DEFAULT NOW(),
      end_time TIMESTAMP NOT NULL,
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
    await pool.query(`INSERT INTO tiers (name, duration_days, apr_percentage) VALUES 
      ('Short Term', 7, 0.50),
      ('Long Term', 30, 2.16),
      ('TESTING', 0.001388, 10.00)`
    );
      
    console.log('Seeded Tiers');
  }
}

// Export raw pool for queries in API
export { pool };