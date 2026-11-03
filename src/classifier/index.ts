import type { AIResult } from '../prompts.js';
import { analyzeTweetsBatch, isGeminiConfigured, type BatchAnalysis } from '../ai/analyzer.js';
import { classifyByRules } from './rules.js';

export interface ClassifyInput {
  id: string;
  text: string;
  tier: number;
}

export interface ClassifyOutcome {
  id: string;
  /**
   * classified: karar verildi (analysis null ise "haber değil").
   * deferred: karar verilemedi (Gemini kotası/hatası); sonraki turda tekrar denenmeli.
   */
  status: 'classified' | 'deferred';
  analysis: AIResult | null;
  via: 'rules' | 'gemini' | 'none';
}

export interface ClassifyOptions {
  /** Gemini çağrısı; test için değiştirilebilir. */
  llm?: (tweets: Array<{ id: string; text: string }>) => Promise<BatchAnalysis[]>;
  llmEnabled?: boolean;
  /** Bu tarama turunda izin verilen en fazla Gemini çağrısı. */
  budget?: { remaining: number };
  batchSize?: number;
  delayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function defaultGeminiBudget(): { remaining: number } {
  const raw = process.env.MAX_GEMINI_CALLS_PER_RUN;
  const configured = raw === undefined || raw.trim() === '' ? 3 : Number(raw);
  return { remaining: Number.isFinite(configured) ? Math.max(0, configured) : 3 };
}

/**
 * Önce ücretsiz kural motoru; yalnızca belirsiz kalanlar (ve bütçe varsa) Gemini'ye gider.
 */
export async function classifyItems(
  items: ClassifyInput[],
  options: ClassifyOptions = {}
): Promise<ClassifyOutcome[]> {
  const llm = options.llm ?? analyzeTweetsBatch;
  const llmEnabled = options.llmEnabled ?? isGeminiConfigured();
  const budget = options.budget ?? defaultGeminiBudget();
  const batchSize = options.batchSize ?? 10;
  const delayMs = options.delayMs ?? 4000;

  const outcomes = new Map<string, ClassifyOutcome>();
  const ambiguous: ClassifyInput[] = [];

  for (const item of items) {
    const verdict = classifyByRules(item.text, { tier: item.tier });
    if (verdict.kind === 'news') {
      outcomes.set(item.id, { id: item.id, status: 'classified', analysis: verdict.analysis, via: 'rules' });
    } else if (verdict.kind === 'noise') {
      outcomes.set(item.id, { id: item.id, status: 'classified', analysis: null, via: 'rules' });
    } else if (!llmEnabled) {
      // Gemini yoksa belirsizleri tekrar tekrar denemenin anlamı yok: haber sayma.
      outcomes.set(item.id, { id: item.id, status: 'classified', analysis: null, via: 'none' });
    } else {
      ambiguous.push(item);
    }
  }

  for (let start = 0; start < ambiguous.length; start += batchSize) {
    const batch = ambiguous.slice(start, start + batchSize);

    if (budget.remaining <= 0) {
      for (const item of batch) {
        outcomes.set(item.id, { id: item.id, status: 'deferred', analysis: null, via: 'none' });
      }
      continue;
    }

    if (start > 0) await sleep(delayMs);
    budget.remaining -= 1;
    const results = await llm(batch.map((item) => ({ id: item.id, text: item.text })));
    const byId = new Map(results.map((result) => [result.id, result]));

    for (const item of batch) {
      const result = byId.get(item.id);
      if (!result) {
        outcomes.set(item.id, { id: item.id, status: 'deferred', analysis: null, via: 'gemini' });
        continue;
      }
      const { id: _id, ...analysis } = result;
      outcomes.set(item.id, {
        id: item.id,
        status: 'classified',
        analysis: analysis.is_news ? analysis : null,
        via: 'gemini'
      });
    }
  }

  return items.map((item) => outcomes.get(item.id)!);
}
