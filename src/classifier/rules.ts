import type { AICategory, AIResult } from '../prompts.js';
import { maxStage, type Stage } from '../confidenceEngine.js';
import { CLUBS } from './clubs.js';

/**
 * Kural tabanlı Türkçe (+ basit İngilizce) futbol haberi sınıflandırıcısı. Ücretsizdir ve
 * çevrimdışı çalışır. Emin olamadığı durumda "ambiguous" döner; üst katman bunu isteğe bağlı
 * olarak Gemini'ye sorar.
 */

export type RuleVerdict =
  | { kind: 'noise' }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'news'; analysis: AIResult };

/** Küçük harf + aksansız (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u). Her karakter 1'e 1 dönüşür. */
export function fold(input: string): string {
  return input
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[’‘`´]/g, "'");
}

// ---------------------------------------------------------------------------
// Kategori
// ---------------------------------------------------------------------------

const SUSPENSION_RE =
  /pfdk|disipline sevk|men cezas|(\d+|bir|iki|uc|dort|bes|alti|yedi)\s+mac(lik)?\s+(ceza|men)|cezali duruma|ceza aldi|cezalandirildi|\bsuspended\b|\bbanned\b|\bsuspension\b/;
const CONTRACT_RE =
  /sozlesme\w*\s+(?:\S+\s+){0,6}?(uzat|yenile)|uzatma opsiyon|opsiyonunu\s+(devreye|kullan)|yeni sozlesme|ek sozlesme|extends? (his |her )?contract|new contract|contract (extension|renewal)|\brenews?\b/;
const INJURY_RE =
  /sakatl|sakat\b|sakatlan|ameliyat|zedelen|kirik|yirtik|cikik|sezonu kapatti|injur|ruled out|surgery|hamstring|\bacl\b/;
const MANAGER_ROLE_RE = /teknik direktor|\bhoca\b|\bhocasi|head coach|\bmanager\b|\bcoach\b/;
const MANAGER_CHANGE_RE =
  /atan|getiril|anlas|gorusme|favori|\badayi|ayril|gorevden|istifa|yollar|sacked|appointed|appoint|replace|new (head )?coach|new manager|parted ways/;
const TRANSFER_RE =
  /transfer|kadrosuna kat|bonservis|kiralik|kirala|imza|anlas|mutabik|teklif|here we go|\bloan\b|medical|\bsigns?\b|signing|\bfee\b|bedel|\bbid\b|\bdeal\b|agreement/;
const SQUAD_RE =
  /kadro disi|kadrodan cikar|kadroya\s+(dondu|girdi|alindi)|kadroda yer (almayacak|almadi|alamadi)|kadroya alinmadi|kadro disi birak|idmana\s+(cikti|dondu)|antrenmana\s+(cikti|dondu)|takimla\s+calis|gozden cikar|back in training|returns? to training/;

function detectCategory(t: string): AICategory | null {
  if (SUSPENSION_RE.test(t)) return 'SUSPENSION';
  if (CONTRACT_RE.test(t)) return 'CONTRACT_EXTENSION';
  if (INJURY_RE.test(t)) return 'INJURY';
  if (MANAGER_ROLE_RE.test(t) && MANAGER_CHANGE_RE.test(t)) return 'MANAGER_STAFF';
  if (TRANSFER_RE.test(t)) return 'TRANSFER';
  if (SQUAD_RE.test(t)) return 'SQUAD_STATUS';
  return null;
}

// ---------------------------------------------------------------------------
// Aşama ve dil
// ---------------------------------------------------------------------------

const OFFICIAL_RE =
  /\bresmen\b|resmi olarak|\bkap'?a\s+bildir|kamuyu aydinlatma|\bofficial(ly)?\b|imza toreni/;
const OFFICIAL_TIER0_RE = /\b(acikladi|duyurdu|bildirdi)\b/;
const ADVANCED_RE =
  /(sona|anlasmaya|imzaya|transfere)\s+(cok\s+)?(yakin|yaklasti|geldi)|prensipte|son asama|masaya oturdu|teklif\s+(yapti|etti|sundu|hazirladi|gonderdi)|resmi teklif|kapida|advanced talks|agreement in principle|verbal agreement|close to (a )?deal|nearing|\bbid\b|\boffer\b/;
const DONE_RE =
  /anlasti|anlasmaya vardi|anlasma\s+saglandi|anlasmaya varildi|imza(yi)?\s+atti|devreye soktu|opsiyonunu\s+kullandi|imzaladi|imzalar atildi|transferi\s+tamamlandi|tamamlandi|mutabik kaldi|saglik kontrolunden gecti|kadrosuna kat|here we go|\bagreed\b|agreement reached|medical (done|completed)|\bsigned\b|\bsigns\b|completed/;
const INTEREST_RE =
  /ilgilen|gundemde|istiyor|istedi|takipte|radar|listesinde|harekete gec|dusunuyor|hedef|interested|target|eyeing|monitoring/;
const HEDGE_RE =
  /iddia|soylenti|kulis|ihtimal|olabilir|muhtemel|bekleniyor|rumou?r|reportedly|\bcould\b|\bmay\b|\bmight\b|according to|iddialara gore|haberlere gore/;
const CERTAIN_RE =
  /kesinlesti|netlesti|tamamdir|tamamlandi|imzalar atildi|\bresmen\b|here we go|\bofficial|confirmed|done deal|imzaladi|anlasti/;
const CANCEL_RE =
  /anlasma\s+saglanamadi|anlasamadi|anlasma\s+cokt|iptal|cokt(u|e)|vazgec|olumsuz|gerceklesmeyecek|fell through|collapsed|called off|deal is off|\bno deal\b|pulled out|\brejected\b/;
const OPINION_RE = /\b(bence|sizce|yorum|fikrim|kanaatim)\b/;
const BREAKING_RE = /son dakika|flas|breaking/;

interface StageInfo {
  stage: Stage;
  hedged: boolean;
  certain: boolean;
  cancelled: boolean;
}

function detectStage(t: string, category: AICategory, tier: number): StageInfo {
  const hedged = HEDGE_RE.test(t);
  const cancelled = CANCEL_RE.test(t);
  const certain = CERTAIN_RE.test(t);
  const isDeal = category === 'TRANSFER' || category === 'CONTRACT_EXTENSION';

  let stage: Stage;
  if (cancelled) stage = 'DONE';
  else if (OFFICIAL_RE.test(t)) stage = 'OFFICIAL';
  else if (tier === 0 && OFFICIAL_TIER0_RE.test(t)) stage = 'OFFICIAL';
  else if (ADVANCED_RE.test(t)) stage = 'ADVANCED';
  else if (DONE_RE.test(t)) stage = 'DONE';
  else if (INTEREST_RE.test(t)) stage = 'INTEREST';
  else stage = isDeal ? 'RUMOR' : 'DONE';

  if (hedged && stage !== 'OFFICIAL' && !cancelled) {
    if (!isDeal) stage = 'RUMOR';
    else if (stage === 'DONE') stage = 'ADVANCED';
    else if (stage === 'ADVANCED') stage = 'INTEREST';
  }

  return { stage, hedged, certain, cancelled };
}

// ---------------------------------------------------------------------------
// Kulüp çıkarımı
// ---------------------------------------------------------------------------

interface ClubHit {
  name: string;
  start: number;
  end: number;
  role: 'from' | 'to' | 'nom';
}

const CLUB_PATTERNS = CLUBS.map((club) => ({
  name: club.name,
  patterns: club.aliases.map((alias) => {
    const folded = fold(alias);
    const escaped = folded.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&').replace(/\s+/g, '\\s+');
    const source = folded.length >= 7 ? `(?<![a-z0-9])${escaped}` : `(?<![a-z0-9])${escaped}(?![a-z0-9])`;
    return new RegExp(source, 'g');
  })
}));

const ABLATIVE_RE = /^'?(?:ten|tan|den|dan)(?![a-z])/;
const DATIVE_RE = /^'?(?:ya|ye|na|ne|a|e)(?![a-z])/;

function findClubs(t: string): ClubHit[] {
  const hits: ClubHit[] = [];
  for (const club of CLUB_PATTERNS) {
    for (const pattern of club.patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(t)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const after = t.slice(end, end + 8);
        const before = t.slice(Math.max(0, start - 12), start);
        let role: ClubHit['role'] = 'nom';
        if (ABLATIVE_RE.test(after) || /\bfrom\s+$/.test(before)) role = 'from';
        else if (DATIVE_RE.test(after) || /\b(to|joins?|for)\s+$/.test(before)) role = 'to';
        hits.push({ name: club.name, start, end, role });
        if (match[0].length === 0) pattern.lastIndex += 1;
      }
    }
  }

  // Çakışmalarda uzun olanı tut, sonra sıraya diz.
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: ClubHit[] = [];
  let lastEnd = -1;
  for (const hit of hits) {
    if (hit.start < lastEnd) continue;
    result.push(hit);
    lastEnd = hit.end;
  }
  return result;
}

interface ClubAssignment {
  from: string | null;
  to: string | null;
  primary: string | null;
  count: number;
}

const ACQUIRE_RE = /kadrosuna kat|transfer|anlasti|anlasma|teklif|imza|\bsign|agree|\bbid\b|\bdeal\b|mutabik/;

function assignClubs(hits: ClubHit[], t: string, isDeal: boolean): ClubAssignment {
  const unique: ClubHit[] = [];
  for (const hit of hits) {
    if (!unique.some((item) => item.name === hit.name)) unique.push(hit);
  }

  const from = unique.find((hit) => hit.role === 'from')?.name ?? null;
  let to = unique.find((hit) => hit.role === 'to')?.name ?? null;

  if (isDeal && !to) {
    const buyer = unique.find((hit) => hit.role === 'nom' && hit.name !== from);
    if (buyer && ACQUIRE_RE.test(t)) to = buyer.name;
  }

  if (isDeal) {
    const only = unique.length === 1 ? unique[0]!.name : null;
    return { from, to, primary: !from && !to ? only : null, count: unique.length };
  }
  return { from: null, to: null, primary: unique[0]?.name ?? null, count: unique.length };
}

// ---------------------------------------------------------------------------
// Kişi adı çıkarımı
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set(
  [
    // gün / ay
    'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar',
    'ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    // manşet kelimeleri
    'flas', 'son', 'dakika', 'resmen', 'resmi', 'transfer', 'transferi', 'haber', 'haberi', 'iste', 'yeni', 'bugun', 'dun',
    'yarin', 'buyuk', 'onemli', 'anlasma', 'teklif', 'sakatlik', 'ameliyat', 'ceza', 'sozlesme', 'kesinlesti', 'mujde',
    'bomba', 'surpriz', 'beklenen', 'sampiyon', 'sampiyonlar', 'sampiyonluk', 'avrupa', 'turkiye', 'turk', 'milli',
    'takim', 'takimi', 'kadro', 'kadrosu', 'sezon', 'hafta', 'mac', 'maci', 'derbi', 'lig', 'ligi', 'super', 'kupa',
    'kupasi', 'tff', 'pfdk', 'uefa', 'fifa', 'kap', 'var', 'hoca', 'hocasi', 'teknik', 'direktor', 'direktoru',
    'baskan', 'baskani', 'yonetim', 'kulup', 'kulubu', 'kulubunun', 'futbolcu', 'oyuncu', 'oyuncusu', 'yildiz',
    'genc', 'tecrubeli', 'milyon', 'euro', 'dolar', 'lira', 'sol', 'sag', 'orta', 'defans', 'forvet', 'kaleci',
    'breaking', 'official', 'exclusive', 'here', 'we', 'go', 'the', 'new', 'club', 'deal', 'done', 'medical', 'loan',
    'premier', 'league', 'champions', 'europa', 'cup', 'world', 'sources', 'agreement', 'contract', 'transfer',
    'kulis', 'iddia', 'soylenti', 'ozel', 'exclusive', 'gundem', 'gelisme', 'canli', 'tamam', 'tamamlandi',
    // uyruk / sıfat
    'italyan', 'italyali', 'alman', 'almanyali', 'ispanyol', 'ispanyali', 'fransiz', 'fransali', 'ingiliz', 'ingiltere',
    'portekiz', 'portekizli', 'brezilyali', 'arjantinli', 'hollandali', 'belcikali', 'turkiyeli', 'yerli', 'yabanci',
    'ozellikle', 'ayrica', 'ancak', 'bununla', 'bu', 'bir', 'her', 'tum', 'butun',
    // genel ek
    've', 'ile', 'icin', 'ama', 'fakat', 'ancak'
  ]
);

const CLUB_TOKENS = new Set<string>();
for (const club of CLUBS) {
  for (const alias of [club.name, ...club.aliases]) {
    for (const token of fold(alias).split(/[\s\-]+/)) {
      if (token.length >= 2) CLUB_TOKENS.add(token);
    }
  }
}

const KEYWORD_TOKEN_RE =
  /^(sakat|transfer|ameliyat|ceza|imza|anlasma|teklif|sozlesme|bonservis|kiralik|kadro|idman|antrenman|hoca|teknik|injur|suspend)/;

const NAME_RE = /(?<![\p{L}\p{N}])(\p{Lu}[\p{L}\-]*(?:['’]\p{L}*)?)(?:\s+\p{Lu}[\p{L}\-]*(?:['’]\p{L}*)?){0,4}/gu;

function isDroppedToken(token: string): boolean {
  const folded = fold(token);
  if (folded.length < 2) return true;
  if (STOP_WORDS.has(folded) || CLUB_TOKENS.has(folded)) return true;
  if (KEYWORD_TOKEN_RE.test(folded)) return true;
  // KISALTMA (TFF, UEFA...) — tamamı büyük harf
  if (token.length >= 2 && token === token.toLocaleUpperCase('tr-TR') && /\p{L}/u.test(token)) return true;
  return false;
}

export function extractNames(original: string): string[] {
  const candidates: string[] = [];
  for (const match of original.matchAll(NAME_RE)) {
    const baseIndex = match.index ?? 0;
    let current: string[] = [];
    const flush = () => {
      if (current.length > 0) candidates.push(current.join(' '));
      current = [];
    };

    for (const tokenMatch of match[0].matchAll(/\S+/g)) {
      const raw = tokenMatch[0].replace(/[,;:.!?]+$/, '');
      const hasSuffix = /['’]/.test(raw);
      const token = raw.replace(/['’].*$/, '');
      if (isDroppedToken(token)) {
        flush();
        continue;
      }
      current.push(token);
      if (hasSuffix) flush();
    }
    flush();
    void baseIndex;
  }

  // Tekrarları ve alt kümeleri ele ("Icardi" ⊂ "Mauro Icardi").
  const unique: string[] = [];
  for (const candidate of candidates) {
    const key = fold(candidate);
    if (!unique.some((item) => fold(item) === key)) unique.push(candidate);
  }
  return unique.filter(
    (candidate) =>
      !unique.some((other) => {
        if (other === candidate) return false;
        const a = fold(candidate).split(' ');
        const b = fold(other).split(' ');
        return b.length > a.length && a.every((token) => b.includes(token));
      })
  );
}

// ---------------------------------------------------------------------------
// Türkçe özet
// ---------------------------------------------------------------------------

const DEAL_STATUS: Record<Stage, string> = {
  OFFICIAL: 'Resmen açıklandı',
  DONE: 'Anlaşma sağlandı',
  ADVANCED: 'Görüşmeler ileri aşamada',
  INTEREST: 'İlgi var, gündemde',
  RUMOR: 'Söylenti aşamasında'
};
const CONTRACT_STATUS: Record<Stage, string> = {
  OFFICIAL: 'Sözleşme resmen uzatıldı',
  DONE: 'Sözleşme uzatma anlaşması sağlandı',
  ADVANCED: 'Sözleşme görüşmeleri ileri aşamada',
  INTEREST: 'Sözleşme uzatma gündemde',
  RUMOR: 'Sözleşme uzatma söylentisi'
};
const OTHER_STATUS: Record<string, string> = {
  INJURY: 'Sakatlık bilgisi',
  SUSPENSION: 'Ceza kararı',
  SQUAD_STATUS: 'Kadro durumu değişti',
  MANAGER_STAFF: 'Teknik heyet / yönetim değişikliği'
};

function buildStatus(category: AICategory, info: StageInfo): string {
  if (info.cancelled && (category === 'TRANSFER' || category === 'CONTRACT_EXTENSION')) {
    return 'Transfer İptal / Anlaşma Çöktü';
  }
  if (category === 'TRANSFER') return DEAL_STATUS[info.stage];
  if (category === 'CONTRACT_EXTENSION') return CONTRACT_STATUS[info.stage];
  const base = OTHER_STATUS[category] ?? 'Gelişme';
  if (info.stage === 'OFFICIAL') return `${base} (resmi)`;
  if (info.stage === 'RUMOR') return `${base} (doğrulanmadı)`;
  return base;
}

// ---------------------------------------------------------------------------
// Ana fonksiyon
// ---------------------------------------------------------------------------

/** Paylaşımın sonundaki kaynak/kredi satırını ("🔗 Fabrizio Romano", "Kaynak: ...") atar; kişi adı sanılmasın. */
export function stripAttribution(text: string): string {
  return text
    .replace(/\s*(?:🔗|📎|🔎|✍️|📰)[^\n]*$/gmu, '')
    .replace(/\n\s*(?:kaynak|source|via)\s*:[^\n]*$/gimu, '')
    .trim();
}

export function classifyByRules(text: string, ctx: { tier: number }): RuleVerdict {
  const original = stripAttribution(text).replace(/\s+/g, ' ').trim();
  if (original.length < 15) return { kind: 'noise' };

  const t = fold(original);
  if (original.includes('?') || OPINION_RE.test(t)) return { kind: 'noise' };

  const clubHits = findClubs(t);
  // "X, Y'yi istiyor" gibi transfer sözcüğü geçmeyen ilgi haberleri de transfer sayılır.
  let category = detectCategory(t) ?? (clubHits.length > 0 && INTEREST_RE.test(t) ? 'TRANSFER' : null);
  if (!category) return { kind: 'noise' };

  const letters = original.match(/\p{L}/gu) ?? [];
  const uppers = original.match(/\p{Lu}/gu) ?? [];
  if (letters.length > 20 && uppers.length / letters.length > 0.6) {
    return { kind: 'ambiguous', reason: 'allcaps' };
  }

  const names = extractNames(original);
  // Unvan isme bitişikse ("Teknik Direktör Emre Belözoğlu ile…") kişi oyuncu değil hoca adayıdır.
  if (category === 'TRANSFER' && names.length === 1) {
    const n = fold(names[0]!).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titled = new RegExp(`(teknik direktor|head coach|manager|hoca)\\w*\\s+(?:\\S+\\s+){0,1}${n}|${n}\\s+(?:\\S+\\s+){0,1}(teknik direktor|head coach|hocalik)`);
    if (titled.test(t)) category = 'MANAGER_STAFF';
  }
  const isDeal = category === 'TRANSFER' || category === 'CONTRACT_EXTENSION';
  const clubs = assignClubs(clubHits, t, isDeal);
  const needsClub = isDeal || category === 'MANAGER_STAFF';

  if (names.length === 0) {
    if (isDeal && clubs.count >= 1) return { kind: 'ambiguous', reason: 'name-missing' };
    return { kind: 'noise' };
  }
  if (names.length > 1) return { kind: 'ambiguous', reason: 'multiple-names' };

  const hasClub = Boolean(clubs.to || clubs.primary || clubs.from);
  if (needsClub && !hasClub) return { kind: 'ambiguous', reason: 'club-missing' };
  if (isDeal && clubs.count > 2) return { kind: 'ambiguous', reason: 'many-clubs' };

  const info = detectStage(t, category, ctx.tier);
  const subjectName = names[0]!;
  const role: AIResult['subjectRole'] = category === 'MANAGER_STAFF' ? 'Teknik Direktör' : 'Oyuncu';
  const status = buildStatus(category, info);

  const clubLabel =
    clubs.from && clubs.to
      ? `${clubs.from} ➔ ${clubs.to}`
      : clubs.to ?? clubs.primary ?? clubs.from ?? null;
  const summaryTr = `${subjectName}${clubLabel ? ` (${clubLabel})` : ''}: ${status}.`;

  const analysis: AIResult = {
    is_news: true,
    category,
    isActionable: true,
    confidenceScore: 0,
    isBreaking: BREAKING_RE.test(t),
    subjectName,
    subjectRole: role,
    fromClub: clubs.from,
    toClub: clubs.to,
    primaryClub: clubs.primary,
    statusDescription: status,
    summaryTr,
    stage: info.stage,
    cancelled: info.cancelled,
    certainLanguage: info.certain,
    hedged: info.hedged
  };
  return { kind: 'news', analysis };
}

export { maxStage };
