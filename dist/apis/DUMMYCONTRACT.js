"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMasterWallet = getMasterWallet;
exports.getStakingContract = getStakingContract;
exports.stakeOnChain = stakeOnChain;
exports.unstakeOnChain = unstakeOnChain;
exports.accumulateRewards = accumulateRewards;
exports.getRewards = getRewards;
exports.getTransactionHash = getTransactionHash;
exports.getUserBalance = getUserBalance;
exports.resetRewards = resetRewards;
const state = {
    masterWallet: '0xMASTERWALLET',
    stakingContract: '0xSTAKINGCONTRACT',
    stakedAmount: 0,
    rewardsPool: 0,
    txCount: 0,
    userBalances: {},
};
function getMasterWallet() {
    return state.masterWallet;
}
function getStakingContract() {
    return state.stakingContract;
}
function stakeOnChain(user, amount) {
    state.stakedAmount += amount;
    state.userBalances[user] = (state.userBalances[user] || 0) + amount;
    state.txCount++;
    return {
        txHash: `0xTXHASH${state.txCount}`,
        user,
        amount,
        stakedTotal: state.stakedAmount,
    };
}
function unstakeOnChain(user, amount) {
    state.stakedAmount -= amount;
    state.userBalances[user] = Math.max(0, (state.userBalances[user] || 0) - amount);
    state.txCount++;
    return {
        txHash: `0xTXHASH${state.txCount}`,
        user,
        amount,
        stakedTotal: state.stakedAmount,
    };
}
function accumulateRewards(amount) {
    state.rewardsPool += amount;
    return state.rewardsPool;
}
function getRewards() {
    return state.rewardsPool;
}
function getTransactionHash() {
    return `0xTXHASH${state.txCount}`;
}
function getUserBalance(user) {
    return state.userBalances[user] || 0;
}
function resetRewards() {
    state.rewardsPool = 0;
}
//# sourceMappingURL=DUMMYCONTRACT.js.map