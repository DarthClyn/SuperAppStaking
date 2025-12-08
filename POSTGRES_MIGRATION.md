# PostgreSQL Migration Guide

## Prerequisites

1. **Install PostgreSQL**
   - Download and install PostgreSQL from https://www.postgresql.org/download/
   - During installation, set a password for the `postgres` user

2. **Install Node.js dependencies**
   ```powershell
   cd D:\QStaking\oldcode
   npm install pg
   ```

## Setup Steps

### 1. Create Database

Open PostgreSQL command line (psql) or pgAdmin and run:

```sql
CREATE DATABASE qstaking;
```

### 2. Update Environment Variables

Edit `.env` file with your PostgreSQL credentials:

```env
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=qstaking
PG_USER=postgres
PG_PASSWORD=your_password_here
```

### 3. Install Dependencies

```powershell
npm install
```

### 4. Start the Server

The server will automatically create the required tables on startup:

```powershell
node apis/index.js
```

You should see:
```
PostgreSQL connected
Tables initialized
User-side staking API server running on port 3001
```

### 5. Test the System

Run the CLI:

```powershell
node apis/cli.js
```

## What Changed

### Database Structure

**MongoDB Collections → PostgreSQL Tables:**

- `stakes` collection → `stakes` table
- `pools` collection → `pools` table  
- `ledger` collection → `ledger` table

### Field Name Conversions

PostgreSQL uses snake_case for column names:

- `stakingType` → `staking_type`
- `startTime` → `start_time`
- `endTime` → `end_time`
- `lastClaimed` → `last_claimed`
- `totalRedeemed` → `total_redeemed`
- `txHash` → `tx_hash`

### API Changes

All API endpoints remain the same. The migration is transparent to the CLI and frontend.

## Verification

Check that tables were created:

```sql
\c qstaking
\dt
```

You should see:
- stakes
- pools
- ledger

## Troubleshooting

**Connection Error:**
- Verify PostgreSQL is running
- Check credentials in `.env`
- Ensure database `qstaking` exists

**Permission Error:**
- Make sure PostgreSQL user has CREATE TABLE permissions

**Port Already in Use:**
- Check if another PostgreSQL instance is running on port 5432

## Clear Database (For Testing)

Use the admin endpoint:

```powershell
Invoke-RestMethod -Method POST -Uri http://localhost:3001/admin/clear-database
```

Or directly in PostgreSQL:

```sql
TRUNCATE stakes, pools, ledger;
```
