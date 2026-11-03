import Parser from 'rss-parser';
import type { FetchLike, RawItem, SourceAdapter, SourceInfo } from '../types.js';
import { httpGetText, toIso } from './http.js';

export interface RssFeedConfig extends Omit<SourceInfo, 'label'> {
  url: string;
  label?: string;
}

/** Genel RSS/Atom kaynağı (spor siteleri, kulüp ve federasyon duyuruları). */
export class RssSource implements SourceAdapter {
  private readonly parser = new Parser();
  readonly info: SourceInfo;

  constructor(
    private readonly config: RssFeedConfig,
    private readonly fetchFn?: FetchLike
  ) {
    this.info = { ...config, label: config.label ?? config.name };
  }

  get name(): string {
    return this.config.name;
  }

  async fetchItems(): Promise<RawItem[]> {
    const xml = await httpGetText(this.config.url, this.fetchFn);
    const feed = await this.parser.parseString(xml);

    return (feed.items ?? []).flatMap((item): RawItem[] => {
      const identity = item.guid || item.link || item.title;
      if (!identity) return [];
      const snippet = (item.contentSnippet || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      const title = (item.title || '').trim();
      const text = snippet && snippet !== title ? `${title}. ${snippet}` : title;
      if (!text) return [];
      return [
        {
          id: `${this.config.key}:${identity}`,
          text,
          url: item.link || this.config.url,
          createdAt: toIso(item.isoDate || item.pubDate),
          source: this.info
        }
      ];
    });
  }
}
