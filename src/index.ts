import { buildDeps } from './app.js';
import { runScan } from './pipeline.js';
import { analyzeTweetsBatch, isGeminiConfigured } from './ai/analyzer.js';

const configuredInterval = Number(process.env.SCAN_INTERVAL_SECONDS);
// Boş/geçersiz/çok küçük değer sürekli döngüye girmesin: en az 60 sn, varsayılan 300 sn.
const SCAN_INTERVAL_MS =
  (process.env.SCAN_INTERVAL_SECONDS?.trim() && Number.isFinite(configuredInterval) ? Math.max(60, configuredInterval) : 300) * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sürekli çalışma modu (kendi bilgisayarınızda/sunucunuzda): `npm start`. GitHub Actions için `npm run scan`. */
async function runContinuously(): Promise<void> {
  const deps = await buildDeps();

  while (true) {
    try {
      await runScan(deps);
    } catch (error: any) {
      console.error('[DÖNGÜ] Tarama sırasında beklenmeyen hata:', error.message);
    }

    console.log(`[DÖNGÜ] Tarama tamamlandı. ${Math.round(SCAN_INTERVAL_MS / 60_000)} dakika sonra tekrar taranacak...`);
    await sleep(SCAN_INTERVAL_MS);
  }
}

// Yalnızca RUN_MOCK_TEST=1 ile çalıştırıldığında Gemini'yi örnek tweetlerle dener.
async function runBatchMockTest(): Promise<void> {
  if (!isGeminiConfigured()) {
    console.log('[TEST_RESULT] GEMINI_API_KEY / AI_MODEL_NAME tanımlı değil, atlandı.');
    return;
  }

  const mockTweets = [
    { id: 'mock-transfer-001', text: 'Fenerbahçe, orta saha oyuncusu için kulübüyle transfer görüşmelerinde sona geldi.' },
    { id: 'mock-joke-002', text: 'Bu maçta hakem yine ne yaptığını bilmiyor, tribünde herkes gülüyor.' },
    { id: 'mock-injury-003', text: 'Galatasaray, yıldız oyuncusunun sakatlığı nedeniyle tedavi sürecine başladığını açıkladı.' }
  ];

  const results = await analyzeTweetsBatch(mockTweets);
  console.log(`[TEST_RESULT] Gemini batch yanıtı: ${JSON.stringify(results)}`);
}

async function main(): Promise<void> {
  if (process.env.RUN_MOCK_TEST === '1') {
    await runBatchMockTest();
  }
  await runContinuously();
}

main();
