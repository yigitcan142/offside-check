import type { SourceAdapter } from '../types.js';
import { RssSource, type RssFeedConfig } from './rss.js';
import { TelegramSource, type TelegramChannelConfig } from './telegram.js';
import { buildXSources } from './x.js';

/**
 * RSS kaynakları.
 *
 * ÖNEMLİ: Aşağıdaki adresleri geliştirme ortamından doğrulayamadım (dış ağ erişimi yoktu).
 * `verified: true` olanlar bilinen/belgelenmiş adreslerdir, diğerleri ADAYDIR.
 * Hangilerinin çalıştığını görmek için: `npm run check:sources`. Çalışmayan kaynak taramayı
 * durdurmaz, yalnızca atlanır ve log'a yazılır. Çalışmayanları silin, kendi bulduklarınızı ekleyin.
 *
 * tier: 0 resmi (kulüp/TFF/KAP) · 1 çok güvenilir · 2 normal · 3 düşük
 */
export const RSS_FEEDS: Array<RssFeedConfig & { verified: boolean }> = [
  // Uluslararası (belgelenmiş adresler)
  { key: 'rss:bbc-football', name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', tier: 2, alignment: 'İngiltere / Global', verified: true },
  { key: 'rss:guardian-football', name: 'The Guardian Football', url: 'https://www.theguardian.com/football/rss', tier: 2, alignment: 'İngiltere / Global', verified: true },

  // Türkiye (ADAY adresler — check:sources ile doğrulayın)
  { key: 'rss:fanatik', name: 'Fanatik', url: 'https://www.fanatik.com.tr/rss/anasayfa', tier: 2, alignment: 'Haber Masası', verified: false },
  { key: 'rss:fotomac', name: 'Fotomaç', url: 'https://www.fotomac.com.tr/rss/anasayfa.xml', tier: 2, alignment: 'Haber Masası', verified: false },
  { key: 'rss:ntvspor', name: 'NTV Spor', url: 'https://www.ntvspor.net/rss', tier: 2, alignment: 'Haber Masası', verified: false },
  { key: 'rss:sabah-spor', name: 'Sabah Spor', url: 'https://www.sabah.com.tr/rss/spor.xml', tier: 2, alignment: 'Haber Masası', verified: false },
  { key: 'rss:hurriyet-spor', name: 'Hürriyet Spor', url: 'https://www.hurriyet.com.tr/rss/spor', tier: 2, alignment: 'Haber Masası', verified: false },
  { key: 'rss:aspor', name: 'A Spor', url: 'https://www.aspor.com.tr/rss/anasayfa.xml', tier: 2, alignment: 'Haber Masası', verified: false }
];

/**
 * Herkese açık Telegram kanalları (https://t.me/s/<kanal> önizlemesi okunur).
 * Muhabirlerin ve kulüplerin resmi kanallarını buraya EKLEYİN; ben gerçek kanal adlarını
 * doğrulayamadığım için uydurma kanal koymadım. Örnek:
 *   { channel: 'kanal_adi', name: 'Görünen Ad', tier: 1, alignment: 'Süper Lig' },
 */
export const TELEGRAM_CHANNELS: TelegramChannelConfig[] = [];

export function buildSources(env: NodeJS.ProcessEnv = process.env): SourceAdapter[] {
  const sources: SourceAdapter[] = [
    ...RSS_FEEDS.map((feed) => new RssSource(feed)),
    ...TELEGRAM_CHANNELS.map((channel) => new TelegramSource(channel)),
    ...buildXSources(env)
  ];
  return sources;
}
