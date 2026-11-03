import dotenv from 'dotenv';
import path from 'path';
import { analyzeTweetsBatch } from './ai/analyzer.js';
import { supabase } from './db/supabase.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function testAiAnalyzer() {
  const { data: reports, error } = await supabase
    .from('reports')
    .select('tweet_id, content, tweet_created_at')
    .order('tweet_created_at', { ascending: false })
    .limit(3);

  if (error) {
    throw new Error(`Failed to load reports: ${error.message}`);
  }

  const analyses = await analyzeTweetsBatch(
    (reports || []).map((report) => ({
      id: report.tweet_id,
      text: report.content || ''
    }))
  );

  console.log('Structured batch analysis:', JSON.stringify(analyses, null, 2));
}

testAiAnalyzer().catch((error: any) => {
  console.error('AI test failed:', error.message);
  process.exitCode = 1;
});
