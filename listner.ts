// listener.ts
import { contract } from './config'; // Imports the provider/contract
import { pool } from './database/connect';
import { ethers } from 'ethers';
import { initializeTables } from './database/models';
async function startListener() {
    console.log("Creating tables if not exist...");
    // Ensure tables exist before listening
    await initializeTables();

    console.log(`Listening for FundsReceived at ${await contract.getAddress()}...`);

    contract.on("FundsReceived", async (sender, amount, event) => {
        // Ethers v6 passes an event object with properties directly (no `.log`).
        // Use `event.transactionHash` and `event.args` (or the `sender` param).
        const txHash = (event && (event.transactionHash || event.transactionHash === '')) ? event.transactionHash : undefined;
        const amountWei = amount.toString();
        // Prefer the `sender` argument (string) and normalize it to lowercase.
        const normalizedSender = typeof sender === 'string' ? sender.toLowerCase() : (event?.args && event.args[0] ? String(event.args[0]).toLowerCase() : '');
        console.log(`💰 Deposit detected: ${ethers.formatEther(amount)} ETH from ${normalizedSender}`);

        try {
            await pool.query('BEGIN');

            // Idempotency Check
            const exists = await pool.query('SELECT 1 FROM transactions WHERE tx_hash = $1', [txHash]);
            if (exists.rows.length > 0) {
                await pool.query('ROLLBACK');
                return;
            }

            // Upsert User Balance
            await pool.query(`
                INSERT INTO users (wallet_address, available_balance_wei) 
                VALUES ($1, $2)
                ON CONFLICT (wallet_address) 
                DO UPDATE SET available_balance_wei = users.available_balance_wei + $2
            `, [normalizedSender, amountWei]);

            // Log Transaction
            await pool.query(`
                INSERT INTO transactions (tx_hash, user_address, type, amount_wei)
                VALUES ($1, $2, 'DEPOSIT', $3)
            `, [txHash, normalizedSender, amountWei]);

            await pool.query('COMMIT');
            console.log("✅ User balance credited.");

        } catch (err) {
            await pool.query('ROLLBACK');
            console.error("❌ Error processing deposit:", err);
        }
    });
}

startListener();