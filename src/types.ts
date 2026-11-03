export interface SourceInfo {
  /** Benzersiz anahtar, ör. "rss:fanatik", "tg:kanaladi", "FabrizioRomano" */
  key: string;
  /** Kısa ad */
  name: string;
  /** Telegram mesajında gösterilen etiket, ör. "@FabrizioRomano" veya "Fanatik" */
  label: string;
  /** 0 resmi, 1 çok güvenilir, 2 normal, 3 düşük */
  tier: number;
  alignment: string;
}

export interface RawItem {
  /** Kaynak içinde benzersiz ve kalıcı kimlik (tekrar işlenmeyi önler) */
  id: string;
  text: string;
  url: string;
  /** ISO 8601 */
  createdAt: string;
  source: SourceInfo;
}

export interface SourceAdapter {
  readonly name: string;
  fetchItems(): Promise<RawItem[]>;
}

export type FetchLike = (
  url: string,
  init?: any
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
