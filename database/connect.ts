// PostgreSQL connection setup
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'qstaking',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',

});

export async function connectDB(): Promise<Pool> {
  try {
    await pool.query('SELECT NOW()');
    console.log('PostgreSQL connected');
    return pool;
  } catch (err) {
    console.error('PostgreSQL connection error:', err);
    throw err;
  }
}

export { pool };
