import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyKnownCoach, configFromEnv, runScan } from '../src/pipeline.js';
import { MemoryStore } from '../src/store.js';
import { classifyItems } from '../src/classifier/index.js';
import type { Publisher } from '../src/publisher.js';
import type { RawItem, SourceAdapter, SourceInfo } from '../src/types.js';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const info = (key: string, tier: number): SourceInfo => ({ key, name: key, label: key, tier, alignment: 'Test' });

function source(key: string, tier: number, items: Array<{ id: string; text: string; minutesAgo: number }>): SourceAdapter {
  const sourceInfo = info(key, tier);
  return {
    name: key,
    async fetchItems(): Promise<RawItem[]> {
      return items.map((item) => ({
        id: `${key}:${item.id}`,
        text: item.text,
        url: `https://example.com/${key}/${item.id}`,
        createdAt: minutesAgo(item.minutesAgo),
        source: sourceInfo
      }));
    }
  };
}

function fakePublisher() {
  const log: string[] = [];
  let nextId = 1000;
  const publisher: Publisher = {
    async send(html, options) {
      const id = nextId++;
      log.push(`send#${id}${options?.replyToMessageId ? `->reply#${options.replyToMessageId}` : ''}`);
      return id;
    },
    async edit(id) {
      log.push(`edit#${id}`);
    }
  };
  return { publisher, log };
}

// Gemini kapalı: yalnızca ücretsiz kural motoru.
const classify = (items: any, options: any) => classifyItems(items, { ...options, llmEnabled: false });

const base = (store: MemoryStore, sources: SourceAdapter[], publisher: Publisher, now = NOW) => ({
  store,
  sources,
  publisher,
  classify,
  now: () => now,
  log: () => {}
});

test('tek bir orta güvenli kaynak yayınlanmaz; ikinci kaynak doğrulayınca yayınlanır; resmi duyuru yanıt olur', async () => {
  const store = new MemoryStore();
  const { publisher, log } = fakePublisher();
  const text = 'Galatasaray, Mauro Icardi ile prensipte anlaştı.';

  // Tur 1: tek orta seviye kaynak (tier 2, ileri aşama) -> eşik altı
  await runScan(base(store, [source('a', 2, [{ id: '1', text, minutesAgo: 30 }])], publisher));
  assert.deepEqual(log, []);
  assert.equal([...store.stories.values()][0]!.published, false);

  // Tur 2: ikinci bağımsız kaynak -> yayınlanır
  await runScan(base(store, [source('b', 2, [{ id: '1', text, minutesAgo: 10 }])], publisher));
  assert.deepEqual(log, ['send#1000']);

  // Tur 3: aynı kaynak aynı haberi tekrar verirse hiçbir şey olmaz (görüldü)
  await runScan(base(store, [source('b', 2, [{ id: '1', text, minutesAgo: 10 }])], publisher));
  assert.deepEqual(log, ['send#1000']);

  // Tur 4: üçüncü kaynak aynı aşamada -> mevcut mesaj güncellenir (edit)
  await runScan(base(store, [source('c', 2, [{ id: '1', text, minutesAgo: 5 }])], publisher));
  assert.deepEqual(log, ['send#1000', 'edit#1000']);

  // Tur 5: kulüp resmen açıklar -> yeni mesaj, ilkine yanıt; önceki kaynaklara "doğru" puanı
  const official = "Galatasaray, Mauro Icardi'nin transferini resmen açıkladı.";
  const result = await runScan(base(store, [source('galatasaray', 0, [{ id: '1', text: official, minutesAgo: 2 }])], publisher));
  assert.deepEqual(log, ['send#1000', 'edit#1000', 'send#1001->reply#1000']);
  assert.equal(result.hits, 3);
  assert.equal(store.stats.get('a')!.hits, 1);
  assert.equal(store.stats.get('b')!.hits, 1);
  assert.equal(store.stats.get('c')!.hits, 1);
  assert.equal(store.stats.get('galatasaray')?.hits ?? 0, 0);
  const story = [...store.stories.values()][0]!;
  assert.equal(story.stage, 'OFFICIAL');
  assert.equal(story.score, 100);
  assert.equal(story.resolved, true);
});

test('farklı oyuncular ayrı mesajlar olur; haber olmayanlar yayınlanmaz ve tekrar sınıflandırılmaz', async () => {
  const store = new MemoryStore();
  const { publisher, log } = fakePublisher();
  const items = [
    { id: '1', text: 'Victor Osimhen sakatlandı, 3 hafta yok.', minutesAgo: 20 },
    { id: '2', text: 'Mauro Icardi sakatlandı ve ameliyat edilecek.', minutesAgo: 15 },
    { id: '3', text: 'Bu maçta hakem yine ne yaptığını bilmiyor.', minutesAgo: 10 }
  ];
  const result = await runScan(base(store, [source('tier1', 1, items)], publisher));
  assert.equal(result.news, 2);
  assert.equal(log.length, 2);
  assert.equal(store.stories.size, 2);
  assert.equal(store.seen.size, 3);
  assert.equal(store.seen.get('tier1:3')!.isNews, false);
});

test('bozuk kaynak taramayı durdurmaz; eski öğeler atlanır', async () => {
  const store = new MemoryStore();
  const { publisher, log } = fakePublisher();
  const broken: SourceAdapter = {
    name: 'bozuk',
    async fetchItems() {
      throw new Error('HTTP 503');
    }
  };
  const old = source('tier1', 1, [{ id: '1', text: 'Victor Osimhen sakatlandı, 3 hafta yok.', minutesAgo: 600 }]);
  const result = await runScan(base(store, [broken, old], publisher));
  assert.equal(result.errors.length, 1);
  assert.equal(result.fresh, 0);
  assert.deepEqual(log, []);
});

test('iptal haberi: önceki "kesin" iddia sahiplerine yanlış puanı, mesaj güncellenir', async () => {
  const store = new MemoryStore();
  const { publisher, log } = fakePublisher();
  await runScan(
    base(store, [
      source('x1', 1, [{ id: '1', text: 'Fenerbahçe, Ismail Yüksek ile anlaştı.', minutesAgo: 60 }]),
      source('x2', 1, [{ id: '1', text: 'Fenerbahçe, Ismail Yüksek ile anlaştı.', minutesAgo: 50 }])
    ], publisher)
  );
  assert.equal(log.length, 1);

  const result = await runScan(
    base(store, [
      source('x3', 1, [{ id: '1', text: "Fenerbahçe'nin Ismail Yüksek transferinde anlaşma sağlanamadı, görüşmeler iptal.", minutesAgo: 5 }])
    ], publisher)
  );
  assert.equal(result.misses, 2);
  assert.equal(store.stats.get('x1')!.misses, 1);
  assert.equal(store.stats.get('x2')!.misses, 1);
  assert.equal(store.stats.get('x3')?.misses ?? 0, 0);
  const story = [...store.stories.values()][0]!;
  assert.equal(story.cancelled, true);
  assert.ok(log.includes('edit#1000'));
});

test('süresi dolan doğrulanmamış iddia kaynağa yanlış puanı yazar', async () => {
  const store = new MemoryStore();
  const { publisher } = fakePublisher();
  const text = 'Beşiktaş, Rafa Silva ile anlaştı.';
  await runScan(
    base(store, [source('s1', 1, [{ id: '1', text, minutesAgo: 30 }]), source('s2', 1, [{ id: '1', text, minutesAgo: 20 }])], publisher)
  );
  const later = NOW + 20 * 24 * 3_600_000;
  const result = await runScan(base(store, [], publisher, later));
  assert.equal(result.misses, 2);
  assert.equal(store.stats.get('s1')!.misses, 1);
  // ikinci kez yanlış sayılmaz
  const again = await runScan(base(store, [], publisher, later + 3_600_000));
  assert.equal(again.misses, 0);
});

test('ayarlar: boş ortam değişkeni (Actions) varsayılana düşer, sayı verilirse kullanılır', () => {
  assert.equal(configFromEnv({ MIN_CONFIDENCE: '' } as any).minConfidence, 50);
  assert.equal(configFromEnv({ MIN_CONFIDENCE: '  ' } as any).minConfidence, 50);
  assert.equal(configFromEnv({ MIN_CONFIDENCE: 'abc' } as any).minConfidence, 50);
  assert.equal(configFromEnv({ MIN_CONFIDENCE: '65' } as any).minConfidence, 65);
  assert.equal(configFromEnv({ MAX_ITEM_AGE_HOURS: '6' } as any).maxItemAgeMs, 6 * 3_600_000);
});

test('Gemini kapalıyken belirsiz öğeler haber sayılmaz; açıkken bütçe aşılırsa ertelenir', async () => {
  const ambiguous = 'Galatasaray, Mauro Icardi ve Victor Osimhen için teklif yaptı.';
  const off = await classifyItems([{ id: '1', text: ambiguous, tier: 2 }], { llmEnabled: false });
  assert.equal(off[0]!.status, 'classified');
  assert.equal(off[0]!.analysis, null);

  let calls = 0;
  const llm = async (tweets: Array<{ id: string; text: string }>) => {
    calls += 1;
    return tweets.map((tweet) => ({
      id: tweet.id,
      is_news: true,
      category: 'TRANSFER' as const,
      isActionable: true,
      confidenceScore: 80,
      isBreaking: false,
      subjectName: 'Mauro Icardi',
      subjectRole: 'Oyuncu' as const,
      fromClub: null,
      toClub: 'Galatasaray',
      primaryClub: null,
      statusDescription: 'Görüşmeler ileri aşamada',
      summaryTr: 'x',
      stage: 'ADVANCED' as const
    }));
  };
  const budget = { remaining: 1 };
  const items = Array.from({ length: 12 }, (_, index) => ({ id: String(index), text: ambiguous, tier: 2 }));
  const on = await classifyItems(items, { llm, llmEnabled: true, budget, batchSize: 10, delayMs: 0 });
  assert.equal(calls, 1);
  assert.equal(on.filter((item) => item.status === 'classified').length, 10);
  assert.equal(on.filter((item) => item.status === 'deferred').length, 2);
  assert.equal(on[0]!.analysis?.subjectName, 'Mauro Icardi');
});

test('daha önce teknik direktör olarak haber olan kişi "Oyuncu" etiketi almaz', () => {
  const base: any = { is_news: true, category: 'TRANSFER', isActionable: true, confidenceScore: 0, subjectName: 'Emre Belözoğlu', subjectRole: 'Oyuncu', toClub: 'Kasımpaşa' };
  const out = applyKnownCoach(base, new Set(['emre belozoglu']));
  assert.equal(out.category, 'MANAGER_STAFF');
  assert.equal(out.subjectRole, 'Teknik Direktör');
  const other = applyKnownCoach({ ...base, subjectName: 'Arda Güler' }, new Set(['emre belozoglu']));
  assert.equal(other.category, 'TRANSFER');
});
