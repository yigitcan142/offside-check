import Parser from 'rss-parser';
import type { FetchLike, RawItem, SourceAdapter, SourceInfo } from '../types.js';
import { REPORTERS, type Reporter } from '../reporters.js';
import { httpGetText, toIso } from './http.js';

/**
 * X (Twitter) kaynakları — VARSAYILAN OLARAK KAPALIDIR.
 *
 * Neden kapalı: nitter.net/xcancel.com X'in ihtarı sonrası kapandı, kalan topluluk sunucuları
 * kararsız ve "kazımayın" diyor. X'ten kazıma kullanım şartlarına da aykırıdır; para kazanılan
 * herkese açık bir bot için bu risklidir. Yine de denemek isterseniz:
 *   NITTER_INSTANCES=https://ornek1.example,https://ornek2.example  (virgülle ayrılmış)
 * ya da ücretli RapidAPI anahtarınız varsa:
 *   ENABLE_X_RAPIDAPI=1 ve RAPIDAPI_KEY=...
 */

function reporterInfo(reporter: Reporter): SourceInfo {
  return {
    key: reporter.username,
    name: reporter.username,
    label: `@${reporter.username}`,
    tier: reporter.tier,
    alignment: reporter.alignment
  };
}

export class NitterSource implements SourceAdapter {
  private readonly parser = new Parser();
  readonly info: SourceInfo;

  constructor(
    private readonly reporter: Reporter,
    private readonly instances: string[],
    private readonly fetchFn?: FetchLike
  ) {
    this.info = reporterInfo(reporter);
  }

  get name(): string {
    return `X(nitter): @${this.reporter.username}`;
  }

  async fetchItems(): Promise<RawItem[]> {
    let lastError: Error | null = null;
    for (const instance of this.instances) {
      try {
        const xml = await httpGetText(`${instance.replace(/\/$/, '')}/${this.reporter.username}/rss`, this.fetchFn);
        const feed = await this.parser.parseString(xml);
        return (feed.items ?? []).flatMap((item): RawItem[] => {
          const statusId = /status\/(\d+)/.exec(item.link ?? '')?.[1];
          const text = (item.title || item.contentSnippet || '').trim();
          if (!statusId || !text) return [];
          return [
            {
              id: statusId,
              text,
              url: `https://x.com/${this.reporter.username}/status/${statusId}`,
              createdAt: toIso(item.isoDate || item.pubDate),
              source: this.info
            }
          ];
        });
      } catch (error: any) {
        lastError = error;
      }
    }
    throw lastError ?? new Error('NITTER_INSTANCES boş');
  }
}

/** Ücretli RapidAPI adaptörü (isteğe bağlı). Tweet kimliğinden gerçek zamanı hesaplar. */
export class RapidApiSource implements SourceAdapter {
  readonly info: SourceInfo;

  constructor(private readonly reporter: Reporter) {
    this.info = reporterInfo(reporter);
  }

  get name(): string {
    return `X(RapidAPI): @${this.reporter.username}`;
  }

  async fetchItems(): Promise<RawItem[]> {
    const { fetchTweetsFromUser } = await import('../scraper/twitter.js');
    const tweets = await fetchTweetsFromUser(this.reporter.username);
    return tweets.map((tweet) => ({
      id: String(tweet.tweetId),
      text: tweet.text,
      url: tweet.url,
      createdAt: new Date(Number(BigInt(tweet.tweetId) >> 22n) + 1_288_834_974_657).toISOString(),
      source: this.info
    }));
  }
}

export function buildXSources(env: NodeJS.ProcessEnv = process.env): SourceAdapter[] {
  const sources: SourceAdapter[] = [];
  const instances = (env.NITTER_INSTANCES ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  if (instances.length > 0) {
    sources.push(...REPORTERS.map((reporter) => new NitterSource(reporter, instances)));
  }
  if (env.ENABLE_X_RAPIDAPI === '1' && env.RAPIDAPI_KEY) {
    sources.push(...REPORTERS.map((reporter) => new RapidApiSource(reporter)));
  }
  return sources;
}
