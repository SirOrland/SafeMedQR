import "dotenv/config";
import { neonConfig, Pool } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Node.js 21+ has a built-in WebSocket — no 'ws' package needed.
neonConfig.webSocketConstructor = globalThis.WebSocket;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on("error", (err: Error) => {
  console.error("[db] pool error:", (err as NodeJS.ErrnoException).code ?? err.message);
});

export default pool;
