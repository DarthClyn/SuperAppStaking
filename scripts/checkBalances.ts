import { pool } from '../database/connect';

async function checkBalances() {
  const sql = `
  SELECT 
    u.wallet_address,
    COALESCE(u.available_balance_wei::numeric,0) AS actual_available,
    COALESCE(dp.deposits,0)::numeric AS total_deposits,
    COALESCE(tp.unstake_payouts,0)::numeric AS total_unstake_payouts,
    COALESCE(cl.claims,0)::numeric AS total_claims,
    COALESCE(sp.allocated_principal,0)::numeric AS allocated_principal,
    (COALESCE(dp.deposits,0) + COALESCE(tp.unstake_payouts,0) + COALESCE(cl.claims,0) - COALESCE(sp.allocated_principal,0)) AS expected_available,
    (COALESCE(u.available_balance_wei,0) - (COALESCE(dp.deposits,0) + COALESCE(tp.unstake_payouts,0) + COALESCE(cl.claims,0) - COALESCE(sp.allocated_principal,0))) AS diff
  FROM users u
  LEFT JOIN (
    SELECT user_address, SUM(amount_wei::numeric) AS deposits
    FROM transactions WHERE type = 'DEPOSIT' GROUP BY user_address
  ) dp ON dp.user_address = u.wallet_address
  LEFT JOIN (
    SELECT user_address, SUM(amount_wei::numeric) AS unstake_payouts
    FROM transactions WHERE type = 'UNSTAKE_PAYOUT' GROUP BY user_address
  ) tp ON tp.user_address = u.wallet_address
  LEFT JOIN (
    SELECT user_address, SUM(amount_wei::numeric) AS claims
    FROM transactions WHERE type = 'CLAIM' GROUP BY user_address
  ) cl ON cl.user_address = u.wallet_address
  LEFT JOIN (
    SELECT user_address, SUM(amount_wei::numeric) AS allocated_principal
    FROM stakes WHERE status IN ('REQUESTED','ACTIVE','ENDED','UNSTAKE_REQUESTED') GROUP BY user_address
  ) sp ON sp.user_address = u.wallet_address
  ORDER BY diff DESC;
  `;

  try {
    const res = await pool.query(sql);
    const rows = res.rows;
    const problematic = rows.filter((r: any) => Number(r.diff) !== 0);
    console.log(`Checked ${rows.length} users. Discrepancies: ${problematic.length}`);
    if (problematic.length > 0) {
      console.table(problematic.map((r: any) => ({
        wallet: r.wallet_address,
        actual_available: r.actual_available,
        expected_available: r.expected_available,
        diff: r.diff,
        allocated_principal: r.allocated_principal,
        deposits: r.total_deposits,
        claims: r.total_claims,
        unstake_payouts: r.total_unstake_payouts
      })));
    } else {
      console.log('All balances reconcile with expected values.');
    }
  } catch (err) {
    console.error('Error running balance check:', err);
  } finally {
    await pool.end();
  }
}

checkBalances();
