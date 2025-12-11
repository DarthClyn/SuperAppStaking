import { pool } from '../database/connect';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    console.log('Checking current TESTING tier threshold...');
    const before = await pool.query("SELECT id, name, activation_threshold_wei FROM tiers WHERE name = 'TESTING'");
    console.table(before.rows);

    const newThreshold = '32000000000000000'; // 0.032 ETH in wei
    const res = await pool.query(`UPDATE tiers SET activation_threshold_wei = $1 WHERE name = 'TESTING' RETURNING id, name, activation_threshold_wei`, [newThreshold]);
    console.log('Updated TESTING tier:');
    console.table(res.rows);

    process.exit(0);
  } catch (err) {
    console.error('Error updating TESTING tier threshold:', err);
    process.exit(1);
  }
}

run();
