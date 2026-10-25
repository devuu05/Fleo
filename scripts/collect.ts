import { getDb } from "../src/db";
import { collectAndDetect } from "../src/lib/pipeline";

async function main() {
  await collectAndDetect(await getDb());
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
