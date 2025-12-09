// CLI for staking simulation aligned to Figma-like flow
import axios from 'axios';
import * as readline from 'readline';

const BASE = 'http://localhost:3001';
const CHAIN = 'Quranium';
const TERM = '6m';
const DISPLAY_APY = 1.08;
const DISPLAY_PERIOD = '6-month (test: 15 min)';
const DISPLAY_PAYOUT = 'Daily';
const DISPLAY_UNSTAKE = 'Locked (no early unstake)';
const MIN_AMOUNT = 1;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q: string): Promise<string> {
  return new Promise(res => rl.question(q, res));
}

function mockBalance(): number {
  // Simple mock balance generator for demo purposes
  return 2000; // could be replaced with a wallet call
}

function printOfferSummary(balance: number, token: string): void {
  console.log('\n--- Invest ---');
  console.log(`Token: ${token}`);
  console.log(`Balance: ${balance} ${token}`);
  console.log(`APY: ${DISPLAY_APY}%`);
  console.log(`Period: ${DISPLAY_PERIOD}`);
  console.log(`Rewards Payout: ${DISPLAY_PAYOUT}`);
  console.log(`Unstaking: ${DISPLAY_UNSTAKE}`);
  console.log(`Min Amount: ${MIN_AMOUNT} ${token}`);
  console.log('Max Amount: None');
  console.log('Auto-renew: Available (uses wallet balance at maturity)');
}

async function stakeUser(user_id: string): Promise<void> {
  const tokenInput = await ask('Select token (ETH/QRN): ');
  const token = tokenInput.trim().toUpperCase() === 'QRN' ? 'QRN' : 'ETH';
  const balance = mockBalance();
  // Fetch available offers for the selected token
  try {
    const offersRes = await axios.get(BASE + `/pool/offers/${token}`);
    const offers = offersRes.data.offers || [];
    if (offers.length > 0) {
      console.log('\nAvailable offers:');
      offers.forEach((o: any, idx: number) => {
        console.log(`${idx + 1}. Term: ${o.term_code} | APR: ${o.apr}% | Payout: ${o.reward_payout_freq} | Min: ${o.min_amount}`);
      });
    } else {
      console.log('\nNo configured offers found for this token; default 6m offer will be used.');
    }
  } catch (err: any) {
    console.log('\nCould not fetch offers for token (continuing):', err.message || err);
  }
  printOfferSummary(balance, token);

  const amountStr = await ask('Enter amount to stake: ');
  const amount = parseFloat(amountStr);
  if (Number.isNaN(amount) || amount < MIN_AMOUNT) {
    console.log(`Amount must be at least ${MIN_AMOUNT}.`);
    return;
  }
  if (amount > balance) {
    console.log('Amount exceeds available balance.');
    return;
  }

  const autoRenewInput = await ask('Enable auto-renew? (y/n): ');
  const auto_renew = autoRenewInput.trim().toLowerCase().startsWith('y');

  console.log('\nConfirm your stake:');
  console.log(`User: ${user_id}`);
  console.log(`Token: ${token}`);
  console.log(`Amount: ${amount}`);
  console.log(`APY: ${DISPLAY_APY}% | Period: ${DISPLAY_PERIOD}`);
  console.log(`Payout: ${DISPLAY_PAYOUT} | Unstake: ${DISPLAY_UNSTAKE}`);
  console.log(`Auto-renew: ${auto_renew ? 'Yes' : 'No'}`);
  const confirm = await ask('Proceed? (y/n): ');
  if (!confirm.trim().toLowerCase().startsWith('y')) {
    console.log('Cancelled.');
    return;
  }

  const res = await axios.post(BASE + '/stake', {
    user_id,
    token,
    chain: CHAIN,
    amount,
    auto_renew
  });
  console.log('Stake request registered:', res.data);

  if (res.data.success && res.data.stake) {
    const stake = res.data.stake;
    const poolRes = await axios.post(BASE + '/pool/addStake', {
      user_id,
      amount,
      token,
      chain: CHAIN,
      stakingType: TERM,
      stake_id: stake.stake_id,
      start_time: stake.start_time,
      end_time: stake.end_time,
      apr: stake.apr
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
  // Only 6m term is active
  const res = await axios.post(BASE + '/pool/flush', { stakingType: TERM });
  if (res.data.pooled) {
    console.log(`Batch pooled for ${TERM}:`, res.data);
  } else {
    console.log(`No pool flush performed. Pending total: ${res.data.totalPending}`);
  }
}

let currentUser: string | null = null;

async function main(): Promise<void> {
  while (true) {
    if (!currentUser) {
      currentUser = await ask('Enter user ID to act as: ');
    }
    console.log(`\n--- Staking CLI (User: ${currentUser}) ---`);
    console.log('1. Stake (6m fixed)');
    console.log('2. See rewards');
    console.log('3. Redeem rewards');
    console.log('4. Unstake (when unlocked)');
    console.log('5. List all stakes');
    console.log('6. List ledger');
    console.log('7. Batch pool (6m)');
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
