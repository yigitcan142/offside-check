import { buildDeps } from './app.js';
import { runScan } from './pipeline.js';

/** Tek seferlik tarama (GitHub Actions ve elle deneme için): `npm run scan` */
async function main(): Promise<void> {
  const deps = await buildDeps();
  const summary = await runScan(deps);

  // Hiçbir kaynaktan veri gelmediyse işi başarısız say: Actions'ta kırmızı görünür.
  if (summary.fetched === 0 && summary.errors.length > 0) {
    console.error('Hiçbir kaynaktan veri alınamadı.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[Tarama] Beklenmeyen hata:', error);
  process.exitCode = 1;
});
