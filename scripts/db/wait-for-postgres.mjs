import { setTimeout as delay } from "node:timers/promises";
import { Client } from "pg";
import { resolveDatabaseUrl } from "./constants.mjs";

const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS ?? 60_000);
const retryDelayMs = 1_000;

async function canConnect(connectionString) {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const connectionString = resolveDatabaseUrl();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await canConnect(connectionString)) {
      console.info("Postgres is ready");
      return;
    }

    await delay(retryDelayMs);
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for Postgres`);
}

void main();
