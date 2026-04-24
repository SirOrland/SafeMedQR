import "dotenv/config";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host:     process.env.DB_HOST     ?? "localhost",
  port:     Number(process.env.DB_PORT ?? 3306),
  user:     process.env.DB_USER     ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME     ?? "safemedsqr",
  waitForConnections: true,
  connectionLimit:    10,
  timezone: "Z"          // store / read all datetimes as UTC
});

// Prevent unhandled fatal errors from crashing the process when MySQL
// is temporarily unreachable. Each route already catches query errors.
pool.on("connection", (conn) => {
  conn.on("error", (err) => {
    console.error("[db] connection error:", (err as NodeJS.ErrnoException).code ?? err.message);
  });
});

export default pool;
