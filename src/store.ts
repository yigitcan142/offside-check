import type { AIResult } from './prompts.js';
import type { Stage } from './confidenceEngine.js';

export interface StorySource {
  key: string;
  name: string;
  label: string;
  tier: number;
  alignment: string;
  url: string;
  /** Bu kaynağın haberde bildirdiği aşama */
  stage: Stage;
  certain: boolean;
  hedged: boolean;
  /** Bu kaynak haberin iptal edildiğini bildirdi (olumlu iddia değil). */
  cancelled?: boolean;
  at: string;
}

export interface StoryRecord {
  storyKey: string;
  category: string;
  subjectName: string;
  club: string | null;
  stage: Stage;
  cancelled: boolean;
  score: number;
  analysis: AIResult;
  sources: StorySource[];
  telegramMessageId: number | null;
  published: boolean;
  /** Muhabir doğruluk kaydı bu hikâye için işlendi mi */
  resolved: boolean;
  firstSeen: string;
  lastUpdated: string;
}

export interface SourceStat {
  key: string;
  hits: number;
  misses: number;
}

export interface SeenRow {
  id: string;
  sourceKey: string;
  isNews: boolean;
}

export interface Store {
  /** Verilen kimliklerden henüz işlenmemiş olanları döner. */
  filterUnseen(ids: string[]): Promise<Set<string>>;
  markSeen(rows: SeenRow[]): Promise<void>;
  listRecentStories(sinceIso: string): Promise<StoryRecord[]>;
  /** Çözümlenmemiş (doğruluk kaydı işlenmemiş) ve `beforeIso`'dan beri güncellenmemiş hikâyeler. */
  listStaleUnresolved(beforeIso: string): Promise<StoryRecord[]>;
  saveStory(story: StoryRecord): Promise<void>;
  getSourceStats(): Promise<Map<string, SourceStat>>;
  saveSourceStats(stats: SourceStat[]): Promise<void>;
}

/** Bellek içi depo: DRY_RUN ve testler için. */
export class MemoryStore implements Store {
  seen = new Map<string, SeenRow>();
  stories = new Map<string, StoryRecord>();
  stats = new Map<string, SourceStat>();

  async filterUnseen(ids: string[]): Promise<Set<string>> {
    return new Set(ids.filter((id) => !this.seen.has(id)));
  }

  async markSeen(rows: SeenRow[]): Promise<void> {
    for (const row of rows) this.seen.set(row.id, row);
  }

  async listRecentStories(sinceIso: string): Promise<StoryRecord[]> {
    return [...this.stories.values()]
      .filter((story) => story.lastUpdated >= sinceIso)
      .map((story) => structuredClone(story));
  }

  async listStaleUnresolved(beforeIso: string): Promise<StoryRecord[]> {
    return [...this.stories.values()]
      .filter((story) => !story.resolved && story.lastUpdated < beforeIso)
      .map((story) => structuredClone(story));
  }

  async saveStory(story: StoryRecord): Promise<void> {
    this.stories.set(story.storyKey, structuredClone(story));
  }

  async getSourceStats(): Promise<Map<string, SourceStat>> {
    return new Map([...this.stats].map(([key, stat]) => [key, { ...stat }]));
  }

  async saveSourceStats(stats: SourceStat[]): Promise<void> {
    for (const stat of stats) this.stats.set(stat.key, { ...stat });
  }
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
};

/** Supabase deposu (migration 002 tablolarını kullanır). */
export class SupabaseStore implements Store {
  constructor(private readonly client: any) {}

  async filterUnseen(ids: string[]): Promise<Set<string>> {
    const unseen = new Set(ids);
    for (const part of chunk(ids, 150)) {
      const { data, error } = await this.client.from('seen_items').select('item_id').in('item_id', part);
      if (error) throw new Error(`seen_items okunamadı: ${error.message}`);
      for (const row of data ?? []) unseen.delete(row.item_id);
    }
    return unseen;
  }

  async markSeen(rows: SeenRow[]): Promise<void> {
    if (rows.length === 0) return;
    const payload = rows.map((row) => ({ item_id: row.id, source_key: row.sourceKey, is_news: row.isNews }));
    for (const part of chunk(payload, 200)) {
      const { error } = await this.client.from('seen_items').upsert(part, { onConflict: 'item_id', ignoreDuplicates: true });
      if (error) throw new Error(`seen_items yazılamadı: ${error.message}`);
    }
  }

  async listRecentStories(sinceIso: string): Promise<StoryRecord[]> {
    const { data, error } = await this.client.from('stories').select('*').gte('last_updated', sinceIso);
    if (error) throw new Error(`stories okunamadı: ${error.message}`);
    return (data ?? []).map(SupabaseStore.toStory);
  }

  async listStaleUnresolved(beforeIso: string): Promise<StoryRecord[]> {
    const { data, error } = await this.client
      .from('stories')
      .select('*')
      .eq('resolved', false)
      .lt('last_updated', beforeIso);
    if (error) throw new Error(`stories okunamadı: ${error.message}`);
    return (data ?? []).map(SupabaseStore.toStory);
  }

  private static toStory(row: any): StoryRecord {
    return {
      storyKey: row.story_key,
      category: row.category,
      subjectName: row.subject_name,
      club: row.club,
      stage: row.stage,
      cancelled: Boolean(row.cancelled),
      score: row.score,
      analysis: row.analysis,
      sources: row.sources ?? [],
      telegramMessageId: row.telegram_message_id ?? null,
      published: Boolean(row.published),
      resolved: Boolean(row.resolved),
      firstSeen: row.first_seen,
      lastUpdated: row.last_updated
    };
  }

  async saveStory(story: StoryRecord): Promise<void> {
    const { error } = await this.client.from('stories').upsert(
      {
        story_key: story.storyKey,
        category: story.category,
        subject_name: story.subjectName,
        club: story.club,
        stage: story.stage,
        cancelled: story.cancelled,
        score: story.score,
        analysis: story.analysis,
        sources: story.sources,
        telegram_message_id: story.telegramMessageId,
        published: story.published,
        resolved: story.resolved,
        first_seen: story.firstSeen,
        last_updated: story.lastUpdated
      },
      { onConflict: 'story_key' }
    );
    if (error) throw new Error(`stories yazılamadı: ${error.message}`);
  }

  async getSourceStats(): Promise<Map<string, SourceStat>> {
    const { data, error } = await this.client.from('source_stats').select('*');
    if (error) throw new Error(`source_stats okunamadı: ${error.message}`);
    return new Map(
      (data ?? []).map((row: any) => [row.source_key, { key: row.source_key, hits: row.hits, misses: row.misses }])
    );
  }

  async saveSourceStats(stats: SourceStat[]): Promise<void> {
    if (stats.length === 0) return;
    const { error } = await this.client.from('source_stats').upsert(
      stats.map((stat) => ({
        source_key: stat.key,
        hits: stat.hits,
        misses: stat.misses,
        updated_at: new Date().toISOString()
      })),
      { onConflict: 'source_key' }
    );
    if (error) throw new Error(`source_stats yazılamadı: ${error.message}`);
  }
}

/** DRY_RUN=1 veya Supabase ayarı yoksa bellek deposu, aksi halde Supabase. */
export async function createStore(env: NodeJS.ProcessEnv = process.env): Promise<Store> {
  const dryRun = env.DRY_RUN === '1';
  const hasSupabase = Boolean(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY));
  if (dryRun || !hasSupabase) {
    console.log(`[Store] Bellek deposu kullanılıyor (${dryRun ? 'DRY_RUN' : 'Supabase ayarı yok'}).`);
    return new MemoryStore();
  }
  const { supabase } = await import('./db/supabase.js');
  return new SupabaseStore(supabase);
}
