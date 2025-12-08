"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEST_DAY_SECONDS = exports.TEST_YEAR_SECONDS = void 0;
exports.formatAmount = formatAmount;
exports.formatTime = formatTime;
exports.calcUserReward = calcUserReward;
// For fast testing: 365 days = 30 minutes
exports.TEST_YEAR_SECONDS = 30 * 60; // 30 minutes as 1 year
exports.TEST_DAY_SECONDS = exports.TEST_YEAR_SECONDS / 365; // 1 day = ~4.93 seconds
function formatAmount(amt) {
    return `${amt} ETH`;
}
function formatTime(ts) {
    return new Date(ts).toISOString();
}
function calcUserReward(stake, totalRewards, now = Date.now()) {
    // Calculate seconds staked since lastClaimed
    const since = stake.last_claimed || stake.start_time;
    // For fixed-term stakes, cap reward calculation at end_time
    let rewardEndTime = now;
    if (stake.end_time && stake.end_time > 0) {
        // If lock period has ended, cap rewards at end_time
        rewardEndTime = Math.min(now, stake.end_time);
    }
    // Calculate only rewards earned up to rewardEndTime
    const secondsStaked = Math.floor((rewardEndTime - since) / 1000);
    // If already past end_time and all rewards claimed, return 0
    if (secondsStaked <= 0) {
        return 0;
    }
    const daysStaked = secondsStaked / exports.TEST_DAY_SECONDS;
    const apy = stake.apr;
    const annualReward = (parseFloat(stake.amount.toString()) * apy) / 100;
    const proportionalReward = (annualReward * daysStaked) / 365;
    const earned = proportionalReward;
    // Cap by totalRewards if needed
    return Math.min(earned, totalRewards);
}
//# sourceMappingURL=helpers.js.map