import * as cheerio from 'cheerio';
import type { FetchLike, RawItem, SourceAdapter, SourceInfo } from '../types.js';
import { httpGetText, toIso } from './http.js';

export interface TelegramChannelConfig {
  /** t.me/<channel> adresindeki kullanıcı adı (@ olmadan) */
  channel: string;
  name?: string;
  tier: number;
  alignment: string;
}

export function telegramSourceInfo(config: TelegramChannelConfig): SourceInfo {
  const name = config.name ?? config.channel;
  return {
    key: `tg:${config.channel}`,
    name,
    label: name,
    tier: config.tier,
    alignment: config.alignment
  };
}

/** Yönlendirilen bahis/reklam mesajlarını ayıklar (haber değildir). */
const SPAM = /bahis|bonus|casino|freespin|çevrimsiz|kupon|güncel giriş|vip kanal|sweet bonanza/i;
export const isSpam = (text: string): boolean => SPAM.test(text);

/** Herkese açık kanal önizlemesini (https://t.me/s/<kanal>) çözer. */
export function parseTelegramPage(html: string, info: SourceInfo): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];

  $('.tgme_widget_message[data-post]').each((_, element) => {
    const post = $(element).attr('data-post');
    if (!post) return;

    const textElement = $(element).find('.tgme_widget_message_text').first();
    if (textElement.length === 0) return;
    textElement.find('br').replaceWith(' ');
    const text = textElement.text().replace(/\s+/g, ' ').trim();
    if (!text || isSpam(text)) return;

    const datetime = $(element).find('.tgme_widget_message_date time').first().attr('datetime');
    items.push({
      id: `${info.key}:${post.split('/').pop()}`,
      text,
      url: `https://t.me/${post}`,
      createdAt: toIso(datetime),
      source: info
    });
  });

  return items;
}

export class TelegramSource implements SourceAdapter {
  readonly info: SourceInfo;

  constructor(
    private readonly config: TelegramChannelConfig,
    private readonly fetchFn?: FetchLike
  ) {
    this.info = telegramSourceInfo(config);
  }

  get name(): string {
    return `Telegram: ${this.info.name}`;
  }

  async fetchItems(): Promise<RawItem[]> {
    const html = await httpGetText(`https://t.me/s/${encodeURIComponent(this.config.channel)}`, this.fetchFn);
    return parseTelegramPage(html, this.info);
  }
}
