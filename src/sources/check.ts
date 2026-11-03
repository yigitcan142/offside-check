import 'dotenv/config';
import { buildSources } from './config.js';

/** `npm run check:sources` — hangi kaynakların gerçekten çalıştığını gösterir. */
async function main() {
  const sources = buildSources();
  if (sources.length === 0) {
    console.log('Hiç kaynak yok. src/sources/config.ts dosyasını düzenleyin.');
    return;
  }

  let working = 0;
  for (const source of sources) {
    try {
      const items = await source.fetchItems();
      const newest = items
        .map((item) => Date.parse(item.createdAt))
        .filter(Number.isFinite)
        .sort((a, b) => b - a)[0];
      const age = newest ? `${Math.round((Date.now() - newest) / 60_000)} dk önce` : 'tarih yok';
      console.log(`✅ ${source.name}: ${items.length} öğe, en yenisi ${age}`);
      if (items.length > 0) working += 1;
    } catch (error: any) {
      console.log(`❌ ${source.name}: ${error.message}`);
    }
  }
  console.log(`\n${working}/${sources.length} kaynak veri döndürdü.`);
}

main();
