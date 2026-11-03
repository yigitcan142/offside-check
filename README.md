# offside-check

Türkçe futbol transfer ve haber botu. Haber kaynaklarını tarar, haberi **ücretsiz** bir kural motoruyla sınıflandırır, bir **güven skoru** hesaplar ve Telegram kanalına yayınlar. Aynı haberi birden fazla kaynak verirse yeni mesaj atmaz, mevcut mesajı günceller. Resmi açıklama gelince önceki mesaja yanıt olarak yeni bir mesaj gönderir.

```
kaynaklar (RSS / Telegram / opsiyonel X)
   → taze ve daha önce görülmemiş öğeler
   → kural tabanlı sınıflandırıcı  (emin olamazsa → isteğe bağlı Gemini, günlük kotayla)
   → hikâye eşleştirme (aynı oyuncu + aynı kategori + uyumlu kulüp)
   → güven skoru → eşik üstündeyse Telegram
   → durum Supabase'de (GitHub Actions her çalışmada sıfırdan başlar)
```

## Hızlı başlangıç

```bash
npm install
cp .env.example .env        # değerleri doldurun
npm test                    # 33 test, ağ gerektirmez
npm run check:sources       # hangi kaynaklar gerçekten çalışıyor?
npm run dry-run             # Telegram'a göndermez, veritabanına yazmaz, mesajları ekrana basar
npm run scan                # tek seferlik gerçek tarama
npm start                   # sürekli çalışma (varsayılan 5 dakikada bir)
```

Supabase için `supabase/migrations/` altındaki SQL dosyalarını sırayla SQL Editor'da çalıştırın (`002_story_state.sql` yeni tabloları açar).

## Kaynaklar

`src/sources/config.ts` dosyasında:

- **RSS** (`RSS_FEEDS`): BBC ve Guardian adresleri bilinen adreslerdir. **Türkiye sitelerinin adreslerini ben doğrulayamadım**, aday olarak koydum. `npm run check:sources` hangilerinin çalıştığını gösterir; çalışmayanı silin ya da doğru adresle değiştirin. Çalışmayan kaynak taramayı durdurmaz, atlanır.
- **Telegram** (`TELEGRAM_CHANNELS`): herkese açık kanalların `t.me/s/<kanal>` önizlemesi okunur. Gerçek kanal adlarını doğrulayamadığım için liste boş; muhabirlerin ve kulüplerin resmî kanallarını kendiniz ekleyin.
- **X / Twitter**: **varsayılan kapalı.** nitter.net ve xcancel.com X'in ihtarı sonrası kapandı, kalan topluluk sunucuları kararsız ve kazınmak istemiyor. X'ten kazıma kullanım şartlarına da aykırıdır; para kazanılan herkese açık bir bot için bu risklidir. Yine de denemek isterseniz `NITTER_INSTANCES` ya da ücretli `RAPIDAPI_KEY` + `ENABLE_X_RAPIDAPI=1` ayarlayın.

`tier`: 0 resmi (kulüp, TFF, KAP) · 1 çok güvenilir · 2 normal · 3 düşük.

## Güven skoru

Formül `src/confidenceEngine.ts` içinde, açıklamasıyla birlikte:

```
puan = 35 × kaynak güvenilirliği + aşama puanı + çapraz doğrulama + dil
```

| Parça | Değerler |
|---|---|
| Aşama | resmi 30 · anlaşma tamam 26 · ileri aşama 18 · ilgi 8 · söylenti 0 |
| Çapraz doğrulama | bağımsız 2 kaynak +12 · 3 ve üstü +20 |
| Dil | "resmen / here we go" +8 · "iddia / kulis / olabilir" −10 |
| Üst sınır | söylenti 49 · ilgi 64 · ileri aşama 89 · anlaşma 97 · resmi 99 (tier 0 resmi duyuru = 100) |

Katsayılar **tahminidir**; geçmiş verilerde "sonradan gerçekleşti mi" bilgisi olmadığı için eğitilemedi. Bunun yerine bot kendini ayarlar:

**Muhabir karnesi.** Bir kaynak "ileri aşama/anlaşma tamam" der ve sonra resmi duyuru gelirse kaynak bir **doğru** puanı alır. İddia iptal olursa ya da 14 gün içinde doğrulanmazsa **yanlış** puanı alır. Kaynağın güvenilirliği başlangıç değerinden (seviyesine göre) bu kayda doğru kayar. Veriler `source_stats` tablosunda birikir; ileride "muhabir karnesi" olarak kendi başına bir içerik de olabilir.

Yayın eşiği `MIN_CONFIDENCE` (varsayılan 50). Tek bir tier 2 kaynağın "ileri aşama" iddiası yayınlanmaz, ikinci bir kaynak teyit edince yayınlanır. Eşiği kanalınızın ihtiyacına göre ayarlayın.

## GitHub Actions ile ücretsiz çalıştırma

1. Repoyu GitHub'a gönderin (**`.env` dosyasını asla commit etmeyin**).
2. Repo → *Settings → Secrets and variables → Actions* altına şu **secrets**'ı ekleyin: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. İsteğe bağlı: `GEMINI_API_KEY`, `AI_MODEL_NAME`.
3. *Actions* sekmesinden `scan` iş akışını elle bir kez çalıştırın (*Run workflow*), sonra ~15 dakikada bir kendiliğinden çalışır.

Bilmeniz gerekenler:

- GitHub zamanlanmış işleri **geciktirebilir veya atlayabilir**; saniye hassasiyeti beklemeyin. Anlık haber için bu mimari yerine sürekli çalışan bir sunucu (`npm start`) gerekir.
- Depoda **60 gün hiç etkinlik olmazsa** GitHub zamanlanmış işleri sessizce kapatır. Arada bir commit atın.
- Kamuya açık depolarda Actions ücretsizdir; güncel koşullar için GitHub'ın sayfasına bakın.
- GitHub'ın veri merkezi IP'leri bazı sitelerde engellenebilir. `check:sources` yerel bilgisayarınızda çalışsa bile Actions'ta bir kaynak başarısız olabilir; Actions log'unda `[Kaynak HATA]` satırlarına bakın.

## Gemini (isteğe bağlı)

Anahtar yoksa bot tamamen ücretsiz çalışır; kural motorunun emin olamadığı haberler (birden çok isim, eksik kulüp, tamamı büyük harf manşet) atlanır. Anahtar varsa yalnızca bu belirsizler Gemini'ye gider ve her turda en fazla `MAX_GEMINI_CALLS_PER_RUN` (varsayılan 3) çağrı yapılır. Kota biterse bot durmaz.

## Para kazanma ve yasal notlar

Hukuki tavsiye değildir; yayına almadan önce kontrol edin.

- **Başkasının haberini kopyalamayın.** Bot yalnızca olgusal bir özet ve kaynağa bağlantı üretir; manşet veya metni birebir yayınlamaz. Bunu bozmayın. Kaynağı her mesajda göstermeye devam edin.
- **Telegram gelir seçenekleri** (reklam ortaklığı programı, sponsorluk, bağlı kuruluş bağlantıları, ücretli kanal) için Telegram'ın ve ilgili ülkenin güncel şartlarını kontrol edin.
- **Güven skoru bir tahmindir**, kesin bilgi değildir. Kanal açıklamasına "otomatik derlenmiştir, doğrulama garantisi yoktur" gibi bir not koymanızı öneririm.
- Botun yanlış bir transferi ya da sakatlığı yayınlama ihtimali vardır. Eşiği yüksek tutmak yanlış haberi azaltır ama haber sayısını da azaltır.

## Bilinen sınırlar

- Kural motoru Türkçe manşetlerdeki yaygın kalıpları tanır; alışılmadık ifadeleri kaçırır. Kaçan haberleri `seen_items` ve log'lardan bulup `src/classifier/rules.ts` içindeki kalıplara ekleyebilirsiniz.
- Oyuncu adı büyük harfle başlayan sözcüklerden çıkarılır; aynı cümlede birden çok isim varsa karar vermez (Gemini yoksa atlar).
- Kulüp sözlüğü `src/classifier/clubs.ts` içindedir; yeni kulüp ve takma ad ekleyebilirsiniz.
- Hikâye eşleştirme oyuncu adı alt kümesine bakar ("Icardi" = "Mauro Icardi"); aynı soyadlı iki oyuncu aynı kulüp ve kategoride çakışabilir.
