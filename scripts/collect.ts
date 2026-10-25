import "dotenv/config"; // tsx doesn't load .env on its own
import { getDb } from "../src/db";
import { collectAndDetect } from "../src/lib/pipeline";

async function main() {
  await collectAndDetect(await getDb());
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
