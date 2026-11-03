import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import type { RawItem } from '../types.js';
import type { AIResult } from '../prompts.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is not defined. Add it to the project root .env file.');
}

if (!supabaseKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is not defined. Add one to the project root .env file.');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
type SourceColumn = 'screen_name' | 'handle';

function isMissingColumnError(error: { code?: string; message?: string }) {
  return error.code === '42703' || /column .* does not exist/i.test(error.message || '');
}

const sourceIdCache = new Map<string, string>();

async function findSource(sourceHandle: string): Promise<string> {
  const normalizedHandle = sourceHandle.replace(/^@/, '').trim();
  const cached = sourceIdCache.get(normalizedHandle);
  if (cached) return cached;

  let sourceColumn: SourceColumn = 'screen_name';
  let lookup = await supabase
    .from('sources')
    .select('id')
    .eq(sourceColumn, normalizedHandle)
    .maybeSingle();

  if (lookup.error && isMissingColumnError(lookup.error)) {
    sourceColumn = 'handle';
    lookup = await supabase
      .from('sources')
      .select('id')
      .eq(sourceColumn, normalizedHandle)
      .maybeSingle();
  }

  if (lookup.error) {
    throw new Error(`Failed to find source @${normalizedHandle}: ${lookup.error.message}`);
  }

  if (lookup.data) {
    sourceIdCache.set(normalizedHandle, lookup.data.id);
    return lookup.data.id;
  }

  const created = await supabase
    .from('sources')
    .insert({ [sourceColumn]: normalizedHandle } as any)
    .select('id')
    .single();

  if (created.error) {
    throw new Error(`Failed to create source @${normalizedHandle}: ${created.error.message}`);
  }

  sourceIdCache.set(normalizedHandle, created.data.id);
  return created.data.id;
}

/**
 * Haberi `reports` tablosuna yazar (siteniz/arşiviniz bu tabloyu okuyorsa uyumlu kalır).
 * `tweet_id` sütunu metin olmalıdır (bkz. supabase/migrations/002_*.sql).
 */
export async function saveReport(item: RawItem, analysis: AIResult, score: number): Promise<void> {
  const sourceId = await findSource(item.source.key);
  const { error } = await supabase.from('reports').upsert(
    {
      source_id: sourceId,
      tweet_id: item.id,
      content: item.text,
      tweet_url: item.url,
      tweet_created_at: item.createdAt,
      category: analysis.category,
      is_actionable: analysis.isActionable,
      summary: analysis.summaryTr,
      entities: analysis,
      confidence_score: score,
      analyzed_at: new Date().toISOString()
    },
    { onConflict: 'tweet_id', ignoreDuplicates: true }
  );
  if (error) {
    throw new Error(`Failed to save report ${item.id}: ${error.message}`);
  }
}
