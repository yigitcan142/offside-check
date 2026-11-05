import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyByRules, extractNames, fold } from '../src/classifier/rules.js';

function news(text: string, tier = 2) {
  const verdict = classifyByRules(text, { tier });
  assert.equal(verdict.kind, 'news', `beklenen: haber, gelen: ${JSON.stringify(verdict)} <- ${text}`);
  return (verdict as any).analysis;
}

test('fold: Türkçe karakterleri sadeleştirir', () => {
  assert.equal(fold('İSTANBUL Çağlar ŞÜKRÜ Iğdır'), 'istanbul caglar sukru igdir');
});

test('kulüp ve oyuncu adı: Galatasaray anlaşma', () => {
  const a = news('Galatasaray, Mauro Icardi ile prensipte anlaştı.');
  assert.equal(a.category, 'TRANSFER');
  assert.equal(a.subjectName, 'Mauro Icardi');
  assert.equal(a.toClub, 'Galatasaray');
  assert.equal(a.stage, 'ADVANCED');
});

test('yön: ablatif = nereden, datif = nereye', () => {
  const a = news("Fenerbahçe, Ismail Yüksek'i Sporting'ten kadrosuna kattı.");
  assert.equal(a.fromClub, 'Sporting CP');
  assert.equal(a.toClub, 'Fenerbahçe');
  assert.equal(a.stage, 'DONE');
});

test('resmi açıklama OFFICIAL', () => {
  const a = news("Beşiktaş, Rafa Silva'nın sözleşmesini uzattığını resmen duyurdu.");
  assert.equal(a.category, 'CONTRACT_EXTENSION');
  assert.equal(a.stage, 'OFFICIAL');
  assert.equal(a.subjectName, 'Rafa Silva');
});

test('açıkladı yalnızca tier 0 için resmi sayılır', () => {
  const text = "Trabzonspor, Trabzonspor'dan Visca'nın sakatlandığını açıkladı.";
  assert.equal(news(text, 0).stage, 'OFFICIAL');
  assert.notEqual(news(text, 2).stage, 'OFFICIAL');
});

test('sakatlık: kulüp zorunlu değil', () => {
  const a = news('Victor Osimhen sakatlandı, 3 hafta yok.');
  assert.equal(a.category, 'INJURY');
  assert.equal(a.subjectName, 'Victor Osimhen');
  assert.equal(a.stage, 'DONE');
});

test('cümle başındaki tek kelimelik isim kabul edilir', () => {
  const a = news('Osimhen sakatlandı ve kadro dışı kaldı.');
  assert.equal(a.subjectName, 'Osimhen');
});

test('iptal edilen transfer', () => {
  const a = news("Galatasaray'ın Mauro Icardi transferinde anlaşma sağlanamadı, görüşmeler iptal.");
  assert.equal(a.cancelled, true);
  assert.equal(a.statusDescription, 'Transfer İptal / Anlaşma Çöktü');
});

test('belirsiz dil (iddia) aşamayı düşürür', () => {
  const a = news("Kulis: Fenerbahçe'nin Edin Dzeko'yu istediği iddia ediliyor.");
  assert.equal(a.hedged, true);
  assert.ok(['RUMOR', 'INTEREST'].includes(a.stage));
});

test('ceza kararı', () => {
  const a = news("PFDK, Fenerbahçe'nin oyuncusu Çağlar Söyüncü'yü 2 maç ceza ile cezalandırdı.");
  assert.equal(a.category, 'SUSPENSION');
  assert.equal(a.subjectName, 'Çağlar Söyüncü');
});

test('teknik direktör değişikliği', () => {
  const a = news("Beşiktaş, teknik direktör Sergen Yalçın ile yollarını ayırdı.");
  assert.equal(a.category, 'MANAGER_STAFF');
  assert.equal(a.subjectRole, 'Teknik Direktör');
  assert.equal(a.primaryClub, 'Beşiktaş');
});

test('İngilizce: here we go', () => {
  const a = news('Viktor Gyökeres to Arsenal, here we go! Agreement reached with Sporting.');
  assert.equal(a.category, 'TRANSFER');
  assert.equal(a.toClub, 'Arsenal');
  assert.equal(a.stage, 'DONE');
  assert.equal(a.certainLanguage, true);
});

test('gürültü: maç yorumu, soru, reklam', () => {
  const noise = [
    'Bu maçta hakem yine ne yaptığını bilmiyor, tribünde herkes gülüyor.',
    "Icardi Galatasaray'a mı gidiyor? Sizce doğru mu?",
    'Bu akşam saat 20.00da canlı yayında derbi öncesi özel yayın!',
    'Harika bir gol attı Galatasaray, tribünler çıldırdı.',
    'Bence bu transfer çok yanlış bir karar olur.',
    'Günaydın'
  ];
  for (const text of noise) {
    assert.equal(classifyByRules(text, { tier: 2 }).kind, 'noise', text);
  }
});

test('birden çok isim veya eksik kulüp belirsiz döner', () => {
  assert.equal(
    classifyByRules("Galatasaray, Mauro Icardi ve Victor Osimhen için teklif yaptı.", { tier: 2 }).kind,
    'ambiguous'
  );
  assert.equal(classifyByRules('Mauro Icardi için imza töreni hazırlığı başladı.', { tier: 2 }).kind, 'ambiguous');
});

test('tamamı büyük harf manşet belirsiz döner', () => {
  const verdict = classifyByRules("GALATASARAY, MAURO ICARDI İLE ANLAŞMAYA VARDI RESMEN AÇIKLANDI", { tier: 2 });
  assert.equal(verdict.kind, 'ambiguous');
});

test('extractNames: kısaltmalar, gün adları ve kulüpler isim sayılmaz', () => {
  assert.deepEqual(extractNames('TFF Pazartesi günü Galatasaray ile Mauro Icardi’yi açıkladı'), ['Mauro Icardi']);
});

test('gerçek Telegram paylaşımı: kaynak satırı ve uyruk sıfatı isim sayılmaz, sözleşme uzatma yakalanır', () => {
  const a = news(
    '⚽️ Inter, Federico Dimarco’nun sözleşmesini Haziran 2028’e kadar uzatma opsiyonunu devreye soktu.\n\n▪️ İtalyan kulübü, yıldız futbolcuyla daha uzun süreli yeni bir sözleşme için görüşmelere başlayacak.\n\n🔗 Fabrizio Romano',
    3
  );
  assert.equal(a.category, 'CONTRACT_EXTENSION');
  assert.equal(a.subjectName, 'Federico Dimarco');
  assert.equal(a.stage, 'DONE');
});

test('gerçek Telegram paylaşımı: "kadroda yer almadı" kadro durumu sayılır', () => {
  const a = news(
    '⚽️ Real Madrid, Şampiyonlar Ligi’nde AEK ile oynayacağı maçın kadrosunu açıkladı.\n\n❌ Son antrenmanda bireysel çalışan Arda Güler, kadroda yer almadı.',
    3
  );
  assert.equal(a.category, 'SQUAD_STATUS');
  assert.equal(a.subjectName, 'Arda Güler');
});

test('teknik direktör adayı oyuncu sayılmaz', () => {
  const r = classifyByRules('Fenerbahçe, Teknik Direktör Emre Belözoğlu ile görüşmelere başladı.', { tier: 3 } as any);
  assert.equal(r.kind, 'news');
  if (r.kind === 'news') {
    assert.equal(r.analysis.category, 'MANAGER_STAFF');
    assert.equal(r.analysis.subjectRole, 'Teknik Direktör');
  }
});

test('"Devamı" ve "Italiano" kişi adı sayılmaz', () => {
  assert.deepEqual(extractNames('Devamı Beşiktaş ayrılık anlaşması sağlandı'), []);
  assert.deepEqual(extractNames('Italiano Beşiktaş için söylenti çıktı'), []);
});

test('röportaj alıntıları haber sayılmaz', () => {
  const v = classifyByRules("🗣️ Fenerbahçe Teknik Sorumlusu Dirk Kuyt:\n\n''Bu kulübü seviyorum, Fenerbahçe'de kalmak istiyorum ve transfer konuşmuyorum.''", { tier: 3 });
  assert.equal(v.kind, 'noise');
});
