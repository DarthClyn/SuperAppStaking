# SuperApp Staking/Earn Architecture Blueprint

## Overview
A scalable staking/earn module for a financial Web3 application, built with TypeScript and PostgreSQL. The system supports multiple assets (ETH, QRN), configurable staking periods/APRs, internal ledger tracking, and integration with external APIs/contracts for config and balance data.

---

## User Flow
1. **Dashboard**
   - Shows total invested amount (sum of active stakes)
   - Shows total rewards earned (accrued, available to claim)
2. **Token Selection**
   - User chooses asset: ETH (Ethereum chain) or QRN (Quranium chain)
3. **Stake List**
   - Lists user's previous stakes for selected token
   - Each entry shows: amount, APR, period, status (REQUESTED/STAKED/RELEASED), time left, rewards, claim/unstake buttons
4. **Stake Action**
   - User can stake more (button)
   - Shows current balance (fetched from external API)
   - User enters amount (min 1, max 32 ETH/QRN, per config)
   - Configs (periods, APRs, min/max) fetched from internal table and/or external API
   - On submit, creates stake record and updates ledger
5. **Rewards/Unstake**
   - User can claim rewards (if available)
   - Unstake only allowed after period ends (no early unstake)

---

## API Endpoints (Blueprint)

### Public Endpoints
- `GET /stake?user_id=...&token=...` — List user's stakes for token
- `POST /stake` — Create new stake (user_id, token, amount, period)
- `POST /stake/unstake/:id` — Unstake when period ends
- `GET /rewards/:user_id` — Get user's accrued rewards
- `POST /rewards/claim` — Claim rewards
- `GET /pool/offers/:symbol` — List available staking offers/configs for asset
- `GET /user/balance/:user_id/:token` — Get user balance (from external API)

### Internal/Admin Endpoints
- `POST /config/offer` — Add/update staking offer/config (asset, period, APR, min/max)
- `GET /ledger?user_id=...` — Get user's ledger history

---

## Database Tables

### users (external, not managed here)
- id (PK)
- ...other app fields

### assets
- id (PK)
- symbol (ETH, QRN, ...)
- name
- chain
- decimals
- min_amount
- max_amount
- is_active
- created_at

### staking_offers (config table)
- id (PK)
- asset_id (FK to assets)
- term_code (e.g. '6m', '9m')
- lock_seconds
- apr
- reward_payout_freq (e.g. 'DAILY')
- min_amount
- max_amount
- status ('ACTIVE', 'INACTIVE')
- created_at

### stakes
- id (PK)
- stake_id (unique per stake)
- user_id (from app)
- asset_id (FK)
- token (ETH/QRN)
- chain
- amount
- offer_id (FK to staking_offers)
- staking_type (term_code)
- pool_id (optional, FK)
- start_time
- end_time
- apr
- status ('REQUESTED', 'STAKED', 'RELEASED')
- reward_accumulated
- reward_index
- last_claimed
- total_redeemed
- auto_renew (keep for future, not used now)
- created_at

### ledger
- id (PK)
- stake_id (FK)
- user_id
- status ('REQUESTED', 'STAKED', 'RELEASED', 'CLAIMED')
- staking_type
- amount
- requested_time
- staked_time
- start_timestamp
- end_timestamp
- apr
- pool_id
- tx_hash
- created_at

### config_sources (for external API/config integration)
- id (PK)
- asset_id (FK)
- source_type ('api', 'contract', ...)
- endpoint_url
- last_synced
- config_json (raw config from external)
- status
- created_at

---

## Data Flow & Integration
- **Config Fetch**: On app start or admin action, configs (periods, APRs, min/max) are fetched from external API/contract and stored in `config_sources` and/or `staking_offers`.
- **Balance Fetch**: User balance is fetched from external API when needed (not stored in DB).
- **Stake Creation**: Uses config from `staking_offers` (or external API if needed), validates min/max, creates stake, updates ledger.
- **Reward Calculation**: Rewards are calculated from stake fields and offer APR/period, not from external pool.
- **Ledger**: All stake actions (request, stake, claim, unstake) are logged for audit/history.

---

## Key Design Principles
- **Scalable**: Supports multiple assets, periods, APRs, and chains
- **Configurable**: All staking configs are managed in DB and/or fetched from external sources
- **Auditable**: Internal ledger tracks all actions
- **Extensible**: Easy to add new assets, periods, chains, or integrate new APIs/contracts
- **Secure**: User IDs and balances are fetched from trusted sources; no direct user input for critical config

---

## UI Mapping (from Figma)
- Main dashboard: total invested, rewards
- Token selection: ETH/QRN
- Stake list: per-token, per-user
- Stake details: APR, period, status, time left, rewards, claim/unstake
- Stake action: balance, min/max, config-driven

---

## Future Extensions
- Add auto-renew logic (already in DB)
- Support for more assets/chains
- Real-time sync with contracts/APIs for config and balances
- Advanced reward logic (compound, bonus, etc.)
- User notifications for stake maturity, rewards, etc.

---

## Example External API Integration
- On config sync: fetch from `https://api.partner.com/staking-configs` and upsert into `config_sources` and `staking_offers`
- On balance fetch: call `https://api.partner.com/user-balance/:user_id/:token`

---

## Summary
This blueprint provides a robust, scalable, and extensible foundation for a staking/earn module in a Web3 financial app, with clear separation of config, stake, ledger, and integration logic. All data is tracked in PostgreSQL, with easy hooks for external API/contract sync.
