// db.js — MySQL connection pool using mysql2
const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
const promisePool = pool.promise();

// Ensure sessions table exists for storing auth sessions
promisePool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME DEFAULT NULL,
        revoked_at DATETIME DEFAULT NULL,
        ip VARCHAR(45),
        user_agent TEXT,
        INDEX (user_id)
    ) ENGINE=InnoDB;
`).then(() => {
    console.log('✅ sessions table ensured');
}).catch(err => {
    console.error('Failed to ensure sessions table', err);
});

pool.getConnection((err, connection) => {
    if (!err)
        console.log('DB connection succeded. The connection ID is:'
            + connection.threadId);
    else {
        console.log('DB connection failed \n Error : ' +
            JSON.stringify(err, undefined, 2));
    }
});
Object.defineProperty(mysql, 'conn', { value: pool });
module.exports = promisePool;