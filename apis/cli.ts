// CLI for staking simulation
import axios from 'axios';
import * as readline from 'readline';

const BASE = 'http://localhost:3001';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q: string): Promise<string> {
  return new Promise(res => rl.question(q, res));
}

async function stakeUser(user_id: string): Promise<void> {
  const amount = parseFloat(await ask('Amount to stake: '));
  const stakingType = await ask('Staking type (flex, 3m, 6m, 12m): ');
  const res = await axios.post(BASE + '/stake', {
    user_id,
    token: 'ETH',
    chain: 'Quranium',
    amount,
    lock: stakingType
  });
  console.log('Stake request registered:', res.data);
  // Add to pool
  if (res.data.success && res.data.stake) {
    const poolRes = await axios.post(BASE + '/pool/addStake', {
      user_id,
      amount,
      token: 'ETH',
      chain: 'Quranium',
      stakingType,
      stake_id: res.data.stake.stake_id,
      start_time: res.data.stake.start_time,
      end_time: res.data.stake.end_time,
      apr: res.data.stake.apr
    });
    console.log('Added to pool for batching:', poolRes.data);
  }
}

async function seeRewardsUser(user_id: string): Promise<void> {
  const res = await axios.get(BASE + '/rewards/' + user_id);
  console.log('Current rewards:', res.data);
}

async function redeemRewardsUser(user_id: string): Promise<void> {
  const res = await axios.post(BASE + '/rewards/claim', { user_id });
  console.log('Redeem response:', res.data);
}

async function unstake(): Promise<void> {
  const stake_id = await ask('Stake ID to unstake: ');
  const res = await axios.post(BASE + '/stake/unstake/' + stake_id);
  console.log('Unstake response:', res.data);
}

async function listStakes(): Promise<void> {
  const res = await axios.get(BASE + '/stake');
  console.log('All stakes:', res.data);
}

async function listLedger(): Promise<void> {
  const res = await axios.get(BASE + '/ledger');
  console.log('Ledger:', res.data);
}

async function flushPool(): Promise<void> {
  // Try to batch all eligible pools for all staking types
  const types = ['flex', '1m', '3m', '6m', '12m'];
  for (const stakingType of types) {
    const res = await axios.post(BASE + '/pool/flush', { stakingType });
    if (res.data.pooled) {
      console.log(`Batch pooled for ${stakingType}:`, res.data);
    }
  }
  console.log('Batch pool operation complete.');
}

let currentUser: string | null = null;

async function main(): Promise<void> {
  while (true) {
    if (!currentUser) {
      currentUser = await ask('Enter user ID to act as: ');
    }
    console.log(`\n--- Staking CLI (User: ${currentUser}) ---`);
    console.log('1. Stake');
    console.log('2. See rewards');
    console.log('3. Redeem rewards');
    console.log('4. Unstake');
    console.log('5. List all stakes (your and others)');
    console.log('6. List ledger (all actions, status, history)');
    console.log('7. Batch pool (combine and stake pending)');
    console.log('8. Switch user');
    console.log('0. Exit');
    const choice = await ask('Choose: ');
    try {
      if (choice === '1') await stakeUser(currentUser);
      else if (choice === '2') await seeRewardsUser(currentUser);
      else if (choice === '3') await redeemRewardsUser(currentUser);
      else if (choice === '4') await unstake();
      else if (choice === '5') await listStakes();
      else if (choice === '6') await listLedger();
      else if (choice === '7') await flushPool();
      else if (choice === '8') { currentUser = null; }
      else if (choice === '0') { rl.close(); process.exit(0); }
      else console.log('Invalid choice.');
    } catch (e: any) {
      console.log('Error:', e.response ? e.response.data : e.message);
    }
  }
}

main();
