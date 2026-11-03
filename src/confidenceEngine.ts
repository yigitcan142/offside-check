/**
 * GÜVEN SKORU FORMÜLÜ
 *
 *   puan = kaynak_kalitesi (0-35) + aşama (0-30) + çapraz doğrulama (0-20) + dil (-10..+8)
 *
 * - Kaynak kalitesi: 35 × en iyi kaynağın güvenilirliği. Güvenilirlik, kaynağın seviyesine (tier)
 *   göre bir başlangıç değerle başlar ve geçmiş doğruluk kaydıyla (hits/misses) güncellenir:
 *     güvenilirlik = (başlangıç × 8 + doğru) / (8 + doğru + yanlış)
 * - Aşama: resmi 30, anlaşma tamam 26, ileri aşama 18, ilgi 8, söylenti 0.
 * - Çapraz doğrulama: bağımsız 2 kaynak +12, 3 ve üstü +20.
 * - Dil: "resmen / here we go / kesinleşti" gibi kesin dil +8, "iddia / kulis / olabilir" gibi
 *   belirsiz dil -10 (tüm kaynaklar belirsiz konuşuyorsa).
 * - Üst sınır aşamaya bağlıdır: söylenti 49, ilgi 64, ileri aşama 89, anlaşma 97, resmi 99.
 *   Resmi bir kaynak (tier 0) resmi duyuru yaparsa 100.
 *
 * Katsayılar tahminidir; gerçek veriyle ayarlamak için muhabir doğruluk kaydı (source_stats)
 * zamanla skorları kendiliğinden düzeltir.
 */

export type Stage = 'OFFICIAL' | 'DONE' | 'ADVANCED' | 'INTEREST' | 'RUMOR';

export const STAGE_RANK: Record<Stage, number> = {
  RUMOR: 0,
  INTEREST: 1,
  ADVANCED: 2,
  DONE: 3,
  OFFICIAL: 4
};

const STAGE_POINTS: Record<Stage, number> = { OFFICIAL: 30, DONE: 26, ADVANCED: 18, INTEREST: 8, RUMOR: 0 };
const STAGE_CAP: Record<Stage, number> = { OFFICIAL: 99, DONE: 97, ADVANCED: 89, INTEREST: 64, RUMOR: 49 };

/** Seviye (tier) başına başlangıç güvenilirliği. */
const TIER_PRIOR = [0.97, 0.8, 0.6, 0.4];
const PRIOR_STRENGTH = 8;

export function sourceReliability(tier: number, hits = 0, misses = 0): number {
  const index = Math.min(Math.max(Math.trunc(tier), 0), TIER_PRIOR.length - 1);
  const prior = TIER_PRIOR[index] ?? 0.4;
  return (prior * PRIOR_STRENGTH + hits) / (PRIOR_STRENGTH + hits + misses);
}

export function maxStage(a: Stage, b: Stage): Stage {
  return STAGE_RANK[b] > STAGE_RANK[a] ? b : a;
}

export interface ConfidenceSource {
  key: string;
  tier: number;
  reliability: number;
}

export interface ConfidenceInput {
  sources: ConfidenceSource[];
  stage: Stage;
  certainLanguage?: boolean;
  hedged?: boolean;
}

export function calculateConfidence(input: ConfidenceInput): number {
  const distinct = new Map<string, ConfidenceSource>();
  for (const source of input.sources) {
    distinct.set(source.key, source);
  }
  const sources = [...distinct.values()];
  if (sources.length === 0) {
    return 0;
  }

  if (input.stage === 'OFFICIAL' && sources.some((source) => source.tier === 0)) {
    return 100;
  }

  const best = Math.max(...sources.map((source) => source.reliability));
  let score = 35 * best + STAGE_POINTS[input.stage];

  if (sources.length >= 3) score += 20;
  else if (sources.length === 2) score += 12;

  if (input.hedged) score -= 10;
  else if (input.certainLanguage) score += 8;

  return Math.max(1, Math.min(Math.round(score), STAGE_CAP[input.stage]));
}
