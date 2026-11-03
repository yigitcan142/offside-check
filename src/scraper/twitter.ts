import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const RAPID_API_KEY = process.env.RAPIDAPI_KEY;
const RAPID_API_HOST = 'twitter-api45.p.rapidapi.com';
const REQUEST_TIMEOUT_MS = 20_000;

export interface ScrapedTweet {
  tweetId: string;
  text: string;
  url: string;
  createdAt: string;
  inReplyToStatusId?: string;
}

export async function fetchTweetsFromUser(username: string): Promise<ScrapedTweet[]> {
  if (!RAPID_API_KEY) {
    throw new Error('RAPIDAPI_KEY is not defined. Add RAPIDAPI_KEY to the project root .env file.');
  }
  const cleanUsername = username.replace(/^@/, '').trim();
  const url = `https://${RAPID_API_HOST}/timeline.php?screenname=${encodeURIComponent(cleanUsername)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': RAPID_API_HOST,
        'x-rapidapi-key': RAPID_API_KEY as string
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      console.warn(`[SCRAPER] @${cleanUsername}: HTTP ${response.status}`);
      return [];
    }

    const body = await response.text();
    if (!body || body.trim() === '') {
      console.warn(`Boş yanıt döndü: @${cleanUsername}`);
      return [];
    }

    const data: any = JSON.parse(body);
    const rawList = Array.isArray(data.timeline) ? data.timeline : [];
    console.log(`[SCRAPER] @${cleanUsername}: ${rawList.length} raw tweets found`);
    const rawById = new Map<string, any>(rawList.map((tweet: any) => [String(tweet.tweet_id), tweet]));

    const mappedTweets = rawList.map((t: any) => ({
      tweetId: String(t.tweet_id),
      text: (() => {
        const replyId = t.in_reply_to_status_id || t.reply_to_status_id || t.in_reply_to;
        const parent = replyId ? rawById.get(String(replyId)) : undefined;
        const sameAuthor = parent && String(parent.author?.screen_name || cleanUsername).toLowerCase()
          === String(t.author?.screen_name || cleanUsername).toLowerCase();
        return sameAuthor ? `${parent.text}\n---\n${t.text}` : t.text;
      })(),
      url: `https://x.com/${t.author?.screen_name || cleanUsername}/status/${t.tweet_id}`,
      createdAt: t.created_at,
      inReplyToStatusId: t.in_reply_to_status_id || t.reply_to_status_id || t.in_reply_to
    }));

    return mappedTweets.slice(0, 10);
  } catch (error: any) {
    console.error(`[SCRAPER_ERROR] @${cleanUsername}:`, error.message);
    return [];
  }
}
