import type { AIResult } from './prompts.js';
import type { RawItem, SourceAdapter } from './types.js';
import { classifyItems, defaultGeminiBudget, type ClassifyOptions } from './classifier/index.js';
import { fold } from './classifier/rules.js';
import {
  calculateConfidence,
  maxStage,
  sourceReliability,
  STAGE_RANK,
  type Stage
} from './confidenceEngine.js';
import { formatTelegramHtml } from './formatter.js';
import type { Publisher } from './publisher.js';
import type { SeenRow, SourceStat, Store, StoryRecord, StorySource } from './store.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface PipelineConfig {
  /** Bu skorun altındaki haberler yayınlanmaz, bekletilir. */
  minConfidence: number;
  /** Bundan eski öğeler işlenmez. */
  maxItemAgeMs: number;
  /** Transfer/sözleşme hikâyeleri bu süre boyunca eşleşir (doğrulama takibi için uzun). */
  longStoryWindowMs: number;
  /** Sakatlık, ceza, kadro, teknik heyet hikâyeleri bu süre boyunca eşleşir. */
  shortStoryWindowMs: number;
  /** Bu süre sonunda doğrulanmayan "kesin" iddialar yanlış sayılır. */
  staleAfterMs: number;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): PipelineConfig {
  const num = (value: string | undefined, fallback: number) => {
    // GitHub Actions'ta tanımsız değişkenler boş metin olarak gelir: boş değer = varsayılan.
    if (value === undefined || value.trim() === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    minConfidence: num(env.MIN_CONFIDENCE, 50),
    maxItemAgeMs: num(env.MAX_ITEM_AGE_HOURS, 3) * HOUR_MS,
    longStoryWindowMs: num(env.STALE_DAYS, 14) * DAY_MS,
    shortStoryWindowMs: num(env.STORY_WINDOW_HOURS, 48) * HOUR_MS,
    staleAfterMs: num(env.STALE_DAYS, 14) * DAY_MS
  };
}

export interface PipelineDeps {
  store: Store;
  sources: SourceAdapter[];
  publisher: Publisher;
  classify?: (items: Array<{ id: string; text: string; tier: number }>, options?: ClassifyOptions) => ReturnType<typeof classifyItems>;
  classifyOptions?: ClassifyOptions;
  saveReport?: (item: RawItem, analysis: AIResult, score: number) => Promise<void>;
  now?: () => number;
  config?: Partial<PipelineConfig>;
  log?: (message: string) => void;
}

export interface ScanSummary {
  fetched: number;
  fresh: number;
  unseen: number;
  news: number;
  published: number;
  replies: number;
  edited: number;
  hits: number;
  misses: number;
  errors: string[];
}

const ALLOWED_CATEGORIES = ['TRANSFER', 'CONTRACT_EXTENSION', 'INJURY', 'SUSPENSION', 'SQUAD_STATUS', 'MANAGER_STAFF'];

/** Emniyet kilidi: yalnızca somut, konusu belli, izin verilen kategorideki haberler hikâye olur. */
export function passesGate(analysis: AIResult): boolean {
  const name = analysis.subjectName?.trim() ?? '';
  return (
    analysis.is_news &&
    analysis.isActionable &&
    name !== '' &&
    !['null', 'belirtilmedi'].includes(name.toLowerCase()) &&
    ALLOWED_CATEGORIES.includes(analysis.category)
  );
}

const slug = (value: string) => fold(value).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const isDeal = (category: string) => category === 'TRANSFER' || category === 'CONTRACT_EXTENSION';
const storyClub = (analysis: AIResult) => analysis.toClub ?? analysis.primaryClub ?? analysis.fromClub ?? null;
const defaultStage = (analysis: AIResult): Stage => analysis.stage ?? (isDeal(analysis.category) ? 'RUMOR' : 'DONE');
const isClaim = (source: StorySource) =>
  !source.cancelled && (source.stage === 'ADVANCED' || source.stage === 'DONE');

export function findMatchingStory(
  stories: StoryRecord[],
  analysis: AIResult,
  nowMs: number,
  config: PipelineConfig
): StoryRecord | undefined {
  const tokens = slug(analysis.subjectName ?? '').split(' ').filter(Boolean);
  if (tokens.length === 0) return undefined;
  const club = storyClub(analysis);
  const window = isDeal(analysis.category) ? config.longStoryWindowMs : config.shortStoryWindowMs;

  return stories.find((story) => {
    if (story.category !== analysis.category) return false;
    if (nowMs - Date.parse(story.lastUpdated) > window) return false;
    const other = slug(story.subjectName).split(' ').filter(Boolean);
    const related = tokens.every((token) => other.includes(token)) || other.every((token) => tokens.includes(token));
    if (!related) return false;
    if (club && story.club && fold(club) !== fold(story.club)) return false;
    return true;
  });
}

function makeStoryKey(analysis: AIResult, nowMs: number): string {
  const club = storyClub(analysis);
  return [
    analysis.category,
    slug(analysis.subjectName ?? '').replace(/ /g, '_'),
    club ? slug(club).replace(/ /g, '_') : 'x',
    new Date(nowMs).toISOString().slice(0, 10)
  ].join('|');
}

export function scoreStory(story: StoryRecord, stats: Map<string, SourceStat>): number {
  const relevant = story.cancelled
    ? story.sources.filter((source) => source.cancelled)
    : story.sources.filter((source) => !source.cancelled);
  const sources = relevant.map((source) => {
    const stat = stats.get(source.key);
    return {
      key: source.key,
      tier: source.tier,
      reliability: sourceReliability(source.tier, stat?.hits ?? 0, stat?.misses ?? 0)
    };
  });
  return calculateConfidence({
    sources,
    stage: story.cancelled ? 'DONE' : story.stage,
    certainLanguage: relevant.some((source) => source.certain),
    hedged: relevant.length > 0 && relevant.every((source) => source.hedged)
  });
}

export function renderStory(story: StoryRecord): string {
  const shown = story.cancelled
    ? story.sources.filter((source) => source.cancelled)
    : story.sources.filter((source) => !source.cancelled);
  return formatTelegramHtml(
    { ...story.analysis, confidenceScore: story.score },
    (shown.length > 0 ? shown : story.sources).map((source) => ({
      tweetUrl: source.url,
      username: source.name,
      label: source.label,
      tier: source.tier,
      alignment: source.alignment
    }))
  );
}

interface Tracker {
  deltas: Map<string, { hits: number; misses: number }>;
  hit(key: string): void;
  miss(key: string): void;
}

function createTracker(): Tracker {
  const deltas = new Map<string, { hits: number; misses: number }>();
  const entry = (key: string) => {
    let value = deltas.get(key);
    if (!value) {
      value = { hits: 0, misses: 0 };
      deltas.set(key, value);
    }
    return value;
  };
  return {
    deltas,
    hit: (key) => void (entry(key).hits += 1),
    miss: (key) => void (entry(key).misses += 1)
  };
}

interface Applied {
  story: StoryRecord;
  upgraded: boolean;
}

function applyItem(
  story: StoryRecord | undefined,
  item: RawItem,
  analysis: AIResult,
  nowIso: string,
  nowMs: number,
  tracker: Tracker
): Applied {
  const claimStage = defaultStage(analysis);
  const cancelling = analysis.cancelled === true;

  const source: StorySource = {
    key: item.source.key,
    name: item.source.name,
    label: item.source.label,
    tier: item.source.tier,
    alignment: item.source.alignment,
    url: item.url,
    stage: cancelling ? 'RUMOR' : claimStage,
    certain: analysis.certainLanguage === true,
    hedged: analysis.hedged === true,
    cancelled: cancelling,
    at: item.createdAt
  };

  if (!story) {
    const created: StoryRecord = {
      storyKey: makeStoryKey(analysis, nowMs),
      category: analysis.category,
      subjectName: analysis.subjectName as string,
      club: storyClub(analysis),
      stage: cancelling ? 'RUMOR' : claimStage,
      cancelled: cancelling,
      score: 0,
      analysis: { ...analysis, stage: cancelling ? 'RUMOR' : claimStage },
      sources: [source],
      telegramMessageId: null,
      published: false,
      resolved: !cancelling && claimStage === 'OFFICIAL',
      firstSeen: nowIso,
      lastUpdated: nowIso
    };
    return { story: created, upgraded: false };
  }

  const previousStage = story.stage;
  const index = story.sources.findIndex((existing) => existing.key === source.key);
  if (index === -1) {
    story.sources.push(source);
  } else {
    const existing = story.sources[index]!;
    if (cancelling || STAGE_RANK[source.stage] >= STAGE_RANK[existing.stage]) {
      story.sources[index] = { ...existing, ...source, certain: existing.certain || source.certain };
    }
  }

  if (cancelling) {
    if (story.stage !== 'OFFICIAL' && !story.cancelled) {
      story.cancelled = true;
      story.analysis = { ...analysis, stage: story.stage, fromClub: analysis.fromClub ?? story.analysis.fromClub, toClub: analysis.toClub ?? story.analysis.toClub, primaryClub: analysis.primaryClub ?? story.analysis.primaryClub };
      if (!story.resolved) {
        for (const earlier of story.sources) {
          if (isClaim(earlier)) tracker.miss(earlier.key);
        }
        story.resolved = true;
      }
    }
  } else {
    story.stage = maxStage(story.stage, claimStage);
    const better = STAGE_RANK[claimStage] >= STAGE_RANK[previousStage];
    story.analysis = {
      ...(better ? analysis : story.analysis),
      stage: story.stage,
      fromClub: (better ? analysis.fromClub : story.analysis.fromClub) ?? analysis.fromClub ?? story.analysis.fromClub,
      toClub: (better ? analysis.toClub : story.analysis.toClub) ?? analysis.toClub ?? story.analysis.toClub,
      primaryClub: (better ? analysis.primaryClub : story.analysis.primaryClub) ?? analysis.primaryClub ?? story.analysis.primaryClub
    };
    story.club = storyClub(story.analysis) ?? story.club;

    // Resmi doğrulama geldi: daha önce "ileri aşama/anlaşma" diyen kaynaklar doğru çıktı.
    if (previousStage !== 'OFFICIAL' && story.stage === 'OFFICIAL' && !story.cancelled && !story.resolved) {
      for (const earlier of story.sources) {
        if (earlier.key !== source.key && isClaim(earlier) && earlier.at <= item.createdAt) {
          tracker.hit(earlier.key);
        }
      }
      story.resolved = true;
    }
  }

  story.lastUpdated = nowIso;
  return { story, upgraded: !cancelling && STAGE_RANK[story.stage] > STAGE_RANK[previousStage] && story.stage !== 'RUMOR' && story.stage !== 'INTEREST' };
}

export async function runScan(deps: PipelineDeps): Promise<ScanSummary> {
  const config: PipelineConfig = { ...configFromEnv(), ...deps.config };
  const nowMs = deps.now?.() ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const log = deps.log ?? ((message: string) => console.log(message));
  const classify = deps.classify ?? classifyItems;
  const budget = deps.classifyOptions?.budget ?? defaultGeminiBudget();
  const { store, publisher } = deps;

  const summary: ScanSummary = {
    fetched: 0, fresh: 0, unseen: 0, news: 0, published: 0, replies: 0, edited: 0, hits: 0, misses: 0, errors: []
  };

  const stats = await store.getSourceStats();
  const tracker = createTracker();
  const seenRows: SeenRow[] = [];

  // 1) Çek, süz, sınıflandır -------------------------------------------------
  const newsItems: Array<{ item: RawItem; analysis: AIResult }> = [];
  for (const source of deps.sources) {
    let items: RawItem[];
    try {
      items = await source.fetchItems();
    } catch (error: any) {
      summary.errors.push(`${source.name}: ${error.message}`);
      log(`[Kaynak HATA] ${source.name}: ${error.message}`);
      continue;
    }
    summary.fetched += items.length;

    const fresh = items.filter((item) => {
      const time = Date.parse(item.createdAt);
      return Number.isFinite(time) && nowMs - time <= config.maxItemAgeMs && time - nowMs <= 10 * 60_000;
    });
    summary.fresh += fresh.length;
    if (fresh.length === 0) continue;

    const unseenIds = await store.filterUnseen(fresh.map((item) => item.id));
    const todo = fresh.filter((item) => unseenIds.has(item.id));
    summary.unseen += todo.length;
    if (todo.length === 0) continue;

    const outcomes = await classify(
      todo.map((item) => ({ id: item.id, text: item.text, tier: item.source.tier })),
      { ...deps.classifyOptions, budget }
    );

    todo.forEach((item, position) => {
      const outcome = outcomes[position];
      if (!outcome || outcome.status === 'deferred') return;
      seenRows.push({ id: item.id, sourceKey: item.source.key, isNews: Boolean(outcome.analysis) });
      if (outcome.analysis && passesGate(outcome.analysis)) {
        newsItems.push({ item, analysis: outcome.analysis });
      }
    });
  }
  summary.news = newsItems.length;

  // 2) Hikâyeleri güncelle (eskiden yeniye) ---------------------------------
  newsItems.sort((a, b) => Date.parse(a.item.createdAt) - Date.parse(b.item.createdAt));
  const stories = await store.listRecentStories(new Date(nowMs - config.longStoryWindowMs).toISOString());
  const touched = new Map<string, StoryRecord>();
  const upgraded = new Set<string>();
  const reportQueue: Array<{ item: RawItem; analysis: AIResult; story: StoryRecord }> = [];

  for (const { item, analysis } of newsItems) {
    const match = findMatchingStory(stories, analysis, nowMs, config);
    const result = applyItem(match, item, analysis, nowIso, nowMs, tracker);
    if (!match) stories.push(result.story);
    touched.set(result.story.storyKey, result.story);
    if (result.upgraded && result.story.published) upgraded.add(result.story.storyKey);
    reportQueue.push({ item, analysis, story: result.story });
  }

  // Doğruluk kaydını istatistiklere işle; skorlar güncel istatistikle hesaplanır.
  const changedStats = new Map<string, SourceStat>();
  const applyDeltas = () => {
    for (const [key, delta] of tracker.deltas) {
      const current = stats.get(key) ?? { key, hits: 0, misses: 0 };
      const next = { key, hits: current.hits + delta.hits, misses: current.misses + delta.misses };
      stats.set(key, next);
      changedStats.set(key, next);
      summary.hits += delta.hits;
      summary.misses += delta.misses;
    }
    tracker.deltas.clear();
  };
  applyDeltas();

  // Süresi dolup doğrulanmayan "kesin" iddialar: kaynaklara yanlış puanı.
  const stale = await store.listStaleUnresolved(new Date(nowMs - config.staleAfterMs).toISOString());
  for (const story of stale) {
    if (story.stage !== 'OFFICIAL' && !story.cancelled) {
      for (const source of story.sources) {
        if (isClaim(source)) tracker.miss(source.key);
      }
    }
    story.resolved = true;
    await store.saveStory(story);
  }
  applyDeltas();

  for (const story of touched.values()) {
    story.score = scoreStory(story, stats);
  }

  // 3) Yayınla / güncelle ------------------------------------------------------
  const candidates = new Map<string, StoryRecord>(touched);
  for (const story of stories) {
    if (!story.published && !candidates.has(story.storyKey)) {
      story.score = scoreStory(story, stats);
      candidates.set(story.storyKey, story);
    }
  }

  for (const story of candidates.values()) {
    try {
      const text = renderStory(story);
      if (!story.published) {
        if (story.score >= config.minConfidence) {
          story.telegramMessageId = await publisher.send(text);
          story.published = true;
          summary.published += 1;
        }
      } else if (upgraded.has(story.storyKey)) {
        const id = await publisher.send(text, { replyToMessageId: story.telegramMessageId });
        story.telegramMessageId = id ?? story.telegramMessageId;
        summary.replies += 1;
      } else if (touched.has(story.storyKey) && story.telegramMessageId) {
        await publisher.edit(story.telegramMessageId, text);
        summary.edited += 1;
      }
      await store.saveStory(story);
    } catch (error: any) {
      summary.errors.push(`${story.storyKey}: ${error.message}`);
      log(`[Yayın HATA] ${story.storyKey}: ${error.message}`);
    }
  }

  // 4) Haber arşivi (`reports` tablosu) -------------------------------------
  if (deps.saveReport) {
    for (const { item, analysis, story } of reportQueue) {
      try {
        await deps.saveReport(item, analysis, story.score);
      } catch (error: any) {
        log(`[Rapor UYARI] ${item.id}: ${error.message}`);
      }
    }
  }

  // 5) Kalıcı durum: istatistikler ve "görüldü" işaretleri --------------------
  if (changedStats.size > 0) await store.saveSourceStats([...changedStats.values()]);
  await store.markSeen(seenRows);

  log(
    `[Tarama] çekilen=${summary.fetched} taze=${summary.fresh} yeni=${summary.unseen} haber=${summary.news} ` +
      `yayın=${summary.published} yanıt=${summary.replies} güncelleme=${summary.edited} ` +
      `doğru=${summary.hits} yanlış=${summary.misses} hata=${summary.errors.length}`
  );
  return summary;
}
