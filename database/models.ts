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
      waiting_period_seconds INT DEFAULT 86400,
      -- Delay before unstake payout in seconds
      unstake_delay_seconds INT DEFAULT 86400
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
      -- When user requested an unstake (delay applies)
      unstake_requested_at TIMESTAMP,
      -- start_time: when stake became ACTIVE (NULL while REQUESTED)
      start_time TIMESTAMP,
      end_time TIMESTAMP,
      status VARCHAR(20) DEFAULT 'REQUESTED',
      -- Last time rewards were claimed for this stake
      last_claimed TIMESTAMP,
      projected_reward_wei NUMERIC(78,0)
      ,chain_id INT
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
    await pool.query(`INSERT INTO tiers (name, duration_days, apr_percentage, waiting_period_seconds, unstake_delay_seconds) VALUES 
      ('Short Term', 7, 0.50, 86400, 86400),
      ('Long Term', 30, 2.16, 86400, 86400),
      ('TESTING', 0.001388, 10.00, 180, 180)`
    );
      
    console.log('Seeded Tiers');
  }

  // Ensure new columns exist on older DBs
  const tierCol = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='tiers' AND column_name='unstake_delay_seconds'");
  if (tierCol.rows.length === 0) {
    await pool.query('ALTER TABLE tiers ADD COLUMN unstake_delay_seconds INT DEFAULT 86400');
    await pool.query('UPDATE tiers SET unstake_delay_seconds = 86400 WHERE unstake_delay_seconds IS NULL');
  }

  const stakeCol1 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='stakes' AND column_name='unstake_requested_at'");
  if (stakeCol1.rows.length === 0) {
    await pool.query('ALTER TABLE stakes ADD COLUMN unstake_requested_at TIMESTAMP');
  }
  const stakeCol2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='stakes' AND column_name='last_claimed'");
  if (stakeCol2.rows.length === 0) {
    await pool.query('ALTER TABLE stakes ADD COLUMN last_claimed TIMESTAMP');
  }
  // Remove deprecated activation_threshold_wei from tiers if present
  try {
    const act = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='tiers' AND column_name='activation_threshold_wei'");
    if (act.rows.length > 0) {
      await pool.query('ALTER TABLE tiers DROP COLUMN IF EXISTS activation_threshold_wei');
    }
  } catch (e) {}

  // Ensure stakes have chain_id column
  const stakeChain = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='stakes' AND column_name='chain_id'");
  if (stakeChain.rows.length === 0) {
    await pool.query('ALTER TABLE stakes ADD COLUMN chain_id INT');
  }
  // Ensure stakes.status default is REQUESTED for compatibility
  try {
    await pool.query("ALTER TABLE stakes ALTER COLUMN status SET DEFAULT 'REQUESTED'");
  } catch (e) {
    // ignore if column doesn't exist or cannot alter
  }

  // Ensure user available balance is non-negative (constraint)
  try {
    await pool.query('ALTER TABLE users ADD CONSTRAINT chk_available_nonnegative CHECK (available_balance_wei >= 0)');
  } catch (e) {
    // ignore if constraint exists or cannot be added
  }

  // Backfill existing rows where appropriate
  await pool.query("UPDATE stakes SET status='REQUESTED' WHERE status IS NULL");

  // Recompute users.available_balance_wei from transactions and stakes (best-effort)
  try {
    await pool.query(`
      WITH d AS (
        SELECT user_address, COALESCE(SUM(amount_wei::numeric),0) AS deposits
        FROM transactions WHERE type = 'DEPOSIT' GROUP BY user_address
      ), u AS (
        SELECT user_address, COALESCE(SUM(amount_wei::numeric),0) AS unstake_payouts
        FROM transactions WHERE type = 'UNSTAKE_PAYOUT' GROUP BY user_address
      ), c AS (
        SELECT user_address, COALESCE(SUM(amount_wei::numeric),0) AS claims
        FROM transactions WHERE type = 'CLAIM' GROUP BY user_address
      ), a AS (
        SELECT user_address, COALESCE(SUM(amount_wei::numeric),0) AS allocated_principal
        FROM stakes WHERE status IN ('REQUESTED','ACTIVE','ENDED','UNSTAKE_REQUESTED') GROUP BY user_address
      )
      UPDATE users
      SET available_balance_wei = COALESCE(d.deposits,0) + COALESCE(u.unstake_payouts,0) + COALESCE(c.claims,0) - COALESCE(a.allocated_principal,0)
      FROM d LEFT JOIN u ON u.user_address = d.user_address LEFT JOIN c ON c.user_address = d.user_address LEFT JOIN a ON a.user_address = d.user_address
      WHERE users.wallet_address = d.user_address
    `);
  } catch (e) {
    // ignore failures here; admin can run manual reconciliation if needed
  }
}

// Export raw pool for queries in API
export { pool };