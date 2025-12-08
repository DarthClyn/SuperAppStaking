"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.connectDB = connectDB;
// PostgreSQL connection setup
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'qstaking',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
});
exports.pool = pool;
async function connectDB() {
    try {
        await pool.query('SELECT NOW()');
        console.log('PostgreSQL connected');
        return pool;
    }
    catch (err) {
        console.error('PostgreSQL connection error:', err);
        throw err;
    }
}
//# sourceMappingURL=connect.js.map