const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    port: process.env.MYSQLPORT
  });

  await connection.query("CREATE DATABASE IF NOT EXISTS mensajesdb;");
  console.log("DB creada o ya existía");
  await connection.end();
}

main();
