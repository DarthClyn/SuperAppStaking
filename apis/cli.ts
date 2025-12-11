// cli.ts
import axios from 'axios';
import * as readline from 'readline';
import { formatTime } from './helpers';
import { ethers } from 'ethers';

const BASE = 'http://localhost:3001';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q: string): Promise<string> {
  return new Promise(res => rl.question(q, res));
}

let currentUser: string | null = null;

async function getPortfolio(user: string) {
    try {
        const res = await axios.get(`${BASE}/stake/portfolio/${user}`);
        console.log(`\n--- Portfolio for ${user} ---`);
        // Convert Wei to ETH for display
        const balEth = (BigInt(res.data.walletBalance) / 1000000000000000000n).toString(); 
        console.log(`Floating Balance: ${balEth} ETH (Available to Stake)`);
        const stakes = res.data.stakes || [];
        if (stakes.length === 0) {
            console.log('No active stakes');
        } else {
            console.log('\nActive Stakes:');
            stakes.forEach((s: any) => {
                const amountWei = s.amount_wei || s.amount || '0';
                // Show fractional ETH accurately
                const amountEth = ethers.formatEther(BigInt(String(amountWei)));
                const requested = s.requested_at ? formatTime(s.requested_at) : 'N/A';
                const start = s.start_time ? formatTime(s.start_time) : 'N/A';
                const end = s.end_time ? formatTime(s.end_time) : 'N/A';
                console.log(`- ID:${s.id} Tier:${s.tier_name || s.tier_id} Amount:${amountEth} ETH Requested:${requested} Start:${start} End:${end} Status:${s.status}`);
            });
        }
    } catch (e: any) { console.log(e.message); }
}

async function stakeUser(user_id: string) {
    const resTiers = await axios.get(`${BASE}/tiers`);
    console.log("\nAvailable Tiers:");
    resTiers.data.forEach((t: any) => {
        console.log(`${t.id}: ${t.name} (${t.duration_days} days @ ${t.apr_percentage}%)`);
    });

    const tier_id = await ask('Enter Tier ID: ');
    const amount = await ask('Amount to stake (ETH): ');

    try {
        const res = await axios.post(`${BASE}/stake`, { user_id, tier_id, amount });
        console.log('✅ Stake Successful:', res.data);
    } catch (e: any) {
        console.log('❌ Error:', e.response ? e.response.data : e.message);
    }
}

async function unstake() {
    const stake_id = await ask('Enter Stake ID to unstake: ');
    try {
        console.log("Processing payout... (this may take a few seconds for blockchain confirmation)");
        const res = await axios.post(`${BASE}/stake/unstake/${stake_id}`, {});
        console.log('✅ Unstake/Payout Successful!');
        console.log(`Tx Hash: ${res.data.txHash}`);
        console.log(`Amount Sent: ${res.data.amount} ETH`);
    } catch (e: any) {
        console.log('❌ Error:', e.response ? e.response.data : e.message);
    }
}

async function main() {
  while (true) {
    if (!currentUser) currentUser = await ask('Enter user Wallet Address to act as: ');
    
    console.log(`\n--- Custodial Staking CLI (${currentUser}) ---`);
    console.log('1. View Portfolio (Floating Balance & Stakes)');
    console.log('2. Create New Stake');
    console.log('3. Unstake & Claim (Trigger Payout)');
    console.log('4. View Transaction Ledger');
    console.log('8. Switch User');
    console.log('0. Exit');
    
    const choice = await ask('Choose: ');
    
    if (choice === '1') await getPortfolio(currentUser);
    else if (choice === '2') await stakeUser(currentUser);
    else if (choice === '3') await unstake();
    else if (choice === '4') {
        const res = await axios.get(`${BASE}/ledger`);
        console.log(res.data);
    }
    else if (choice === '8') currentUser = null;
    else if (choice === '0') process.exit(0);
  }
}

main();