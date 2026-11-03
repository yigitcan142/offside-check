import type { FetchLike } from '../types.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; OffsideCheckBot/1.0; +https://github.com/yigitcan142/offside-check)';

export async function httpGetText(url: string, fetchFn: FetchLike = fetch as unknown as FetchLike, timeoutMs = 15_000): Promise<string> {
  const response = await fetchFn(url, {
    method: 'GET',
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xml,application/rss+xml,*/*' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (${url})`);
  }
  return response.text();
}

export function toIso(value: string | number | Date | undefined | null, fallback: Date = new Date()): string {
  if (value === undefined || value === null || value === '') return fallback.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}
