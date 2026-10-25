import "dotenv/config"; // tsx doesn't load .env on its own
import { closeDb, getDb } from "../src/db";
import { collectAndDetect } from "../src/lib/pipeline";

async function main() {
  await collectAndDetect(await getDb());
}
main().then(closeDb, async (e) => { console.error(e); process.exitCode = 1; await closeDb(); });
