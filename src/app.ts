import 'dotenv/config';
import type { PipelineDeps } from './pipeline.js';
import { createConsolePublisher, createTelegramPublisher } from './publisher.js';
import { buildSources } from './sources/config.js';
import { createStore } from './store.js';

/**
 * DRY_RUN=1: Telegram'a göndermez, Supabase'e yazmaz; mesajları ekrana basar (güvenli deneme).
 * Aksi halde TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID ve Supabase ayarları gerekir.
 */
export async function buildDeps(env: NodeJS.ProcessEnv = process.env): Promise<PipelineDeps> {
  const dryRun = env.DRY_RUN === '1';
  const store = await createStore(env);
  const sources = buildSources(env);
  if (sources.length === 0) {
    console.warn('[Uyarı] Hiç kaynak yok. src/sources/config.ts dosyasını düzenleyin.');
  }

  const usingSupabase = !dryRun && Boolean(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY));
  const saveReport = usingSupabase ? (await import('./db/supabase.js')).saveReport : undefined;

  return {
    store,
    sources,
    publisher: dryRun ? createConsolePublisher() : createTelegramPublisher(env),
    saveReport
  };
}
