-- 002: Botun durumu artık Supabase'de tutulur (GitHub Actions her çalışmada sıfırdan başlar).
-- Supabase SQL Editor'da bir kez çalıştırın.

-- 1) Görülen öğeler: aynı haber tekrar işlenmesin.
create table if not exists public.seen_items (
  item_id text primary key,
  source_key text,
  is_news boolean not null default false,
  seen_at timestamptz not null default now()
);

-- 2) Hikâyeler: aynı haberi veren kaynakların birleştiği kayıt ve Telegram mesaj kimliği.
create table if not exists public.stories (
  story_key text primary key,
  category text not null,
  subject_name text not null,
  club text,
  stage text not null,
  cancelled boolean not null default false,
  score integer not null default 0,
  analysis jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  telegram_message_id bigint,
  published boolean not null default false,
  resolved boolean not null default false,
  first_seen timestamptz not null default now(),
  last_updated timestamptz not null default now()
);
create index if not exists stories_last_updated_idx on public.stories (last_updated desc);
create index if not exists stories_unresolved_idx on public.stories (resolved, last_updated);

-- 3) Muhabir/kaynak karnesi: doğru ve yanlış çıkan "kesin" iddialar.
create table if not exists public.source_stats (
  source_key text primary key,
  hits integer not null default 0,
  misses integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Bu tablolar yalnızca bot tarafından (service role anahtarıyla) kullanılır.
-- RLS açık ve politika yok = anon anahtarıyla erişilemez; service role RLS'i atlar.
alter table public.seen_items enable row level security;
alter table public.stories enable row level security;
alter table public.source_stats enable row level security;

-- 4) `reports` tablosu: RSS/Telegram öğe kimlikleri sayı değildir (ör. "rss:fanatik:https://...").
-- tweet_id sütunu zaten text ise bu komut zararsızdır; değilse metne çevirir.
-- (Bu sütuna bağlı bir view veya yabancı anahtar varsa önce onları kaldırmanız gerekebilir.)
alter table public.reports alter column tweet_id type text using tweet_id::text;
