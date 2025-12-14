import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();
// Use a simple JsonRpcProvider with the RPC URL from env. ethers v6 expects
// `new ethers.JsonRpcProvider(url)`; removed unsupported extra args.
export const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
// The Admin Wallet that OWNS the contract (must have ETH for gas)
export const adminWallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);

// Contract Config
export const CONTRACT_ADDRESS =  process.env.CONTRACT_ADDRESS || '0x61944CE769dcC68a28d7312f0595C6dE18D9e3EE';
const CONTRACT_ABI = [
  "event FundsReceived(address indexed sender, uint256 amount, uint256 timestamp)"
];

// Writeable Contract Instance (Signed by Admin)
export const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, adminWallet);