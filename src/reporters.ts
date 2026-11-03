export interface Reporter {
  username: string;
  tier: number;
  alignment: string;
}

export const REPORTERS: Reporter[] = [
  // 1. KÜRESEL TRANSFER OTORİTELERİ (Türkiye Bağlantılı Sıcak Haberler)
  { username: 'FabrizioRomano', tier: 1, alignment: 'Global / Türkiye' },
  { username: 'DiMarzio', tier: 2, alignment: 'İtalya / Global' },
  { username: 'David_Ornstein', tier: 1, alignment: 'İngiltere / Global' },
  { username: 'Plettigoal', tier: 2, alignment: 'Almanya / Sky' },
  { username: 'FabriceHawkins', tier: 2, alignment: 'Fransa / RMC' },

  // 2. KURUMSAL SPOR AJANSLARI & YAYINCILAR (Tüm Süper Lig & Türkiye)
  { username: 'SportsDigitale', tier: 1, alignment: 'Türkiye Masası' },
  { username: 'futbolarena', tier: 2, alignment: 'Türkiye Masası' },
  { username: 'ajansspor', tier: 2, alignment: 'Türkiye Masası' },
  { username: 'trtspor', tier: 1, alignment: 'Resmi / Kamu' },
  { username: 'beINSPORTS_TR', tier: 1, alignment: 'Yayıncı Kuruluş' },
  { username: 'AksamSpor', tier: 2, alignment: 'Haber Masası' },
  { username: 'fanatikcomtr', tier: 2, alignment: 'Haber Masası' },
  { username: 'fotomac', tier: 2, alignment: 'Haber Masası' },
  { username: 'ntvspor', tier: 2, alignment: 'Haber Masası' },

  // 3. GENEL TRANSFER MASASI (Tüm Süper Lig Kulüplerini Tutan Muhabirler)
  { username: 'yagosabuncuoglu', tier: 1, alignment: 'Süper Lig' },
  { username: 'ertansuzgun', tier: 2, alignment: 'Süper Lig' },
  { username: 'resatcan_oz', tier: 2, alignment: 'Süper Lig' },
  { username: 'Salimmanav', tier: 2, alignment: 'Süper Lig / Anadolu' },
  { username: 'gokmenozcan', tier: 2, alignment: 'Süper Lig' },
  { username: 'OmerAlbayrak54', tier: 2, alignment: 'Süper Lig / TFF' },
  { username: 'yakupcinar', tier: 2, alignment: 'Süper Lig' },
  { username: 'baris_yurduseven', tier: 2, alignment: 'Süper Lig' },
  { username: 'serhanturk', tier: 2, alignment: 'Süper Lig' },
  { username: 'CeyhunSamet', tier: 2, alignment: 'Süper Lig' },

  // 4. GALATASARAY MASASI
  { username: 'AliNaciKucuk', tier: 2, alignment: 'Galatasaray' },
  { username: 'NevzatDindar', tier: 2, alignment: 'Galatasaray' },
  { username: 'kayatemel_', tier: 2, alignment: 'Galatasaray' },
  { username: 'burhancanterzii', tier: 2, alignment: 'Galatasaray' },
  { username: 'kutlu_akpinar', tier: 2, alignment: 'Galatasaray' },
  { username: 'EmreKaplanN', tier: 2, alignment: 'Galatasaray' },
  { username: 'BerkantGuler_', tier: 2, alignment: 'Galatasaray' },

  // 5. FENERBAHÇE MASASI
  { username: 'SercanHamzaolu', tier: 2, alignment: 'Fenerbahçe' },
  { username: 'ahmetselimkul', tier: 2, alignment: 'Fenerbahçe' },
  { username: 'ArdaBirben_', tier: 2, alignment: 'Fenerbahçe' },
  { username: 'ElisBuseArac', tier: 2, alignment: 'Fenerbahçe' },
  { username: 'YusufKenan_', tier: 2, alignment: 'Fenerbahçe' },
  { username: 'GurkanAk', tier: 2, alignment: 'Fenerbahçe' },
  { username: 'volkandemir', tier: 2, alignment: 'Fenerbahçe' },

  // 6. BEŞİKTAŞ MASASI
  { username: 'sercandikme', tier: 1, alignment: 'Beşiktaş' },
  { username: 'firatgunayer', tier: 2, alignment: 'Beşiktaş' },
  { username: 'serdarsaridag', tier: 2, alignment: 'Beşiktaş' },
  { username: 'MuratOzen1903', tier: 2, alignment: 'Beşiktaş' },
  { username: 'oguzhankts', tier: 2, alignment: 'Beşiktaş' },
  { username: 'gokhancetin9', tier: 2, alignment: 'Beşiktaş' },

  // 7. TRABZONSPOR MASASI
  { username: 'HasanTuncel61', tier: 2, alignment: 'Trabzonspor' },
  { username: 'yunusemresel', tier: 2, alignment: 'Trabzonspor' },
  { username: 'SafacanKonuksever', tier: 2, alignment: 'Trabzonspor' }
];