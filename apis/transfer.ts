import * as express from 'express';
import { Request, Response } from 'express';
import { pool } from '../database/connect';
import { adminWallet, contract, provider, CONTRACT_ADDRESS } from '../config';
import { ethers } from 'ethers';

const router = express.Router();

// POST /transfer/send
// Body: { to: string, amount: string } amount in ETH
router.post('/send', async (req: Request, res: Response) => {
  const { to, amount } = req.body;
  if (!to || !amount) { res.status(400).json({ error: 'to and amount required' }); return; }
  try {
    const value = ethers.parseEther(amount.toString());
    const valueStr = value.toString();

    // Begin DB-managed withdraw: create pending tx and deduct user's available balance under lock
    await pool.query('BEGIN');
    const userRow = await pool.query('SELECT available_balance_wei FROM users WHERE wallet_address = $1 FOR UPDATE', [to.toLowerCase()]);
    if (userRow.rows.length === 0) {
      await pool.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const avail = BigInt(userRow.rows[0].available_balance_wei || '0');
    if (avail < BigInt(valueStr)) {
      await pool.query('ROLLBACK');
      res.status(400).json({ error: 'Insufficient available balance' });
      return;
    }

    const insertRes = await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES (NULL, $1, 'WITHDRAW_PENDING', $2) RETURNING id`, [to.toLowerCase(), valueStr]);
    const txId = insertRes.rows[0].id;
    await pool.query('UPDATE users SET available_balance_wei = available_balance_wei - $1 WHERE wallet_address = $2', [valueStr, to.toLowerCase()]);
    await pool.query('COMMIT');

    // send on-chain from admin wallet
    try {
      const tx = await adminWallet.sendTransaction({ to, value });
      await tx.wait();
      await pool.query(`UPDATE transactions SET tx_hash = $1, type = 'WITHDRAW' WHERE id = $2`, [tx.hash, txId]);
      res.json({ success: true, txHash: tx.hash });
    } catch (sendErr: any) {
      // on failure, refund user's available balance and mark transaction failed
      try {
        await pool.query('BEGIN');
        await pool.query('UPDATE users SET available_balance_wei = available_balance_wei + $1 WHERE wallet_address = $2', [valueStr, to.toLowerCase()]);
        await pool.query(`UPDATE transactions SET type = 'WITHDRAW_FAILED' WHERE id = $1`, [txId]);
        await pool.query('COMMIT');
      } catch (compErr) {
        try { await pool.query('ROLLBACK'); } catch (_) {}
        console.error('Failed to rollback after send error', compErr);
      }
      console.error('Wallet send error', sendErr);
      res.status(500).json({ error: 'Send failed', detail: sendErr.message });
    }
  } catch (err: any) {
    try { await pool.query('ROLLBACK'); } catch (_) {}
    console.error('Wallet send error', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /transfer/contract-payout
// Body: { to: string, amount: string } amount in ETH
router.post('/contract-payout', async (req: Request, res: Response) => {
  const { to, amount } = req.body;
  if (!to || !amount) { res.status(400).json({ error: 'to and amount required' }); return; }
  try {
    if (typeof contract.payoutUser !== 'function') {
      res.status(500).json({ error: 'contract.payoutUser not available on configured contract ABI' });
      return;
    }
    const value = ethers.parseEther(amount.toString());
    const tx = await contract.payoutUser(to, value);
    await tx.wait();
    await pool.query(`INSERT INTO transactions (tx_hash, user_address, type, amount_wei) VALUES ($1, $2, 'CONTRACT_PAYOUT', $3)`, [tx.hash, to.toLowerCase(), value.toString()]);
    res.json({ success: true, txHash: tx.hash });
  } catch (err: any) {
    console.error('Contract payout error', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /transfer/contract-balance
router.get('/contract-balance', async (_req: Request, res: Response) => {
  try {
    const bal = await provider.getBalance(CONTRACT_ADDRESS);
    res.json({ balanceWei: bal.toString(), balanceEth: ethers.formatEther(bal) });
  } catch (err: any) {
    console.error('Error reading contract balance', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

