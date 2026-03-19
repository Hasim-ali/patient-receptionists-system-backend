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

module.exports = pool.promise();