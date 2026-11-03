import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RssSource } from '../src/sources/rss.js';
import { isSpam, parseTelegramPage, telegramSourceInfo, TelegramSource } from '../src/sources/telegram.js';
import { NitterSource } from '../src/sources/x.js';

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test Spor</title>
  <item><title>Galatasaray, Mauro Icardi ile anlaştı</title><link>https://ornek.com/haber/1</link>
    <guid>haber-1</guid><pubDate>Tue, 03 Nov 2026 11:50:00 GMT</pubDate>
    <description>Sarı-kırmızılılar golcü oyuncuyla prensipte anlaştı.</description></item>
  <item><title>Tarihsiz haber</title><link>https://ornek.com/haber/2</link></item>
</channel></rss>`;

const TG_HTML = `<html><body>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="kanal/101">
  <div class="tgme_widget_message_text js-message_text" dir="auto">Son dakika:<br/>Fenerbahçe, Ismail Yüksek ile anlaştı!</div>
  <div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/kanal/101"><time datetime="2026-11-03T11:45:00+00:00" class="time">11:45</time></a></div>
</div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="kanal/102">
  <div class="tgme_widget_message_photo_wrap"></div>
  <div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/kanal/102"><time datetime="2026-11-03T11:46:00+00:00">11:46</time></a></div>
</div></div>
</body></html>`;

const NITTER_XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
  <item><title>Galatasaray, Mauro Icardi ile anlaştı</title><link>https://nitter.ornek/FabrizioRomano/status/1234567890123#m</link>
  <pubDate>Tue, 03 Nov 2026 11:50:00 GMT</pubDate></item></channel></rss>`;

const okFetch = (body: string) => async () => ({ ok: true, status: 200, text: async () => body });

test('RSS: öğeleri RawItem yapar, kimlik kaynak anahtarını içerir', async () => {
  const source = new RssSource(
    { key: 'rss:test', name: 'Test Spor', url: 'https://ornek.com/rss', tier: 2, alignment: 'Haber Masası' },
    okFetch(RSS_XML)
  );
  const items = await source.fetchItems();
  assert.equal(items.length, 2);
  assert.equal(items[0]!.id, 'rss:test:haber-1');
  assert.equal(items[0]!.createdAt, '2026-11-03T11:50:00.000Z');
  assert.match(items[0]!.text, /Mauro Icardi ile anlaştı\. Sarı-kırmızılılar/);
  assert.equal(items[0]!.source.tier, 2);
});

test('RSS: HTTP hatası fırlatır', async () => {
  const source = new RssSource(
    { key: 'rss:test', name: 'Test', url: 'https://ornek.com/rss', tier: 2, alignment: 'x' },
    async () => ({ ok: false, status: 503, text: async () => '' })
  );
  await assert.rejects(() => source.fetchItems(), /HTTP 503/);
});

test('Telegram: kanal önizlemesini çözer, metinsiz mesajları atlar', async () => {
  const info = telegramSourceInfo({ channel: 'kanal', tier: 1, alignment: 'Süper Lig' });
  const items = parseTelegramPage(TG_HTML, info);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.id, 'tg:kanal:101');
  assert.equal(items[0]!.url, 'https://t.me/kanal/101');
  assert.equal(items[0]!.text, 'Son dakika: Fenerbahçe, Ismail Yüksek ile anlaştı!');
  assert.equal(items[0]!.createdAt, '2026-11-03T11:45:00.000Z');

  const source = new TelegramSource({ channel: 'kanal', tier: 1, alignment: 'Süper Lig' }, okFetch(TG_HTML));
  assert.equal((await source.fetchItems()).length, 1);
});

test('Nitter (isteğe bağlı): ilk çalışan sunucudan okur, kimliği durum numarasından alır', async () => {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    if (url.startsWith('https://olu.example')) return { ok: false, status: 502, text: async () => '' };
    return { ok: true, status: 200, text: async () => NITTER_XML };
  };
  const source = new NitterSource(
    { username: 'FabrizioRomano', tier: 1, alignment: 'Global' },
    ['https://olu.example', 'https://canli.example'],
    fetchFn
  );
  const items = await source.fetchItems();
  assert.equal(calls.length, 2);
  assert.equal(items[0]!.id, '1234567890123');
  assert.equal(items[0]!.url, 'https://x.com/FabrizioRomano/status/1234567890123');
});

test('Telegram: bahis/reklam mesajları ayıklanır, haberler kalır', () => {
  assert.equal(isSpam('Bahisbey ile günlük maçlarda bonus kazan'), true);
  assert.equal(isSpam('Kavbet Giriş 🔥 Turnuvalar Bonuslar'), true);
  assert.equal(isSpam('Fenerbahçe, Ismail Yüksek ile anlaştı!'), false);
  assert.equal(isSpam('Galatasaray yüzde 30 oranında indirim yaptı'), false);
});
