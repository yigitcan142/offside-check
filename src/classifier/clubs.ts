/**
 * Kulüp sözlüğü. Takma adlar (alias) küçük harf ve aksansız karşılaştırılır (bkz. fold()).
 * 7+ karakterli takma adlar önek olarak eşleşir (Galatasaray'a, Fenerbahçeye...), kısaları tam kelime.
 * Genel kelimelerle çakışan adları (ör. tek başına "Milan" oyuncu adıdır) bilerek koymadım.
 */
export interface ClubEntry {
  name: string;
  aliases: string[];
}

export const CLUBS: ClubEntry[] = [
  // Türkiye
  { name: 'Galatasaray', aliases: ['galatasaray', 'cimbom', 'gs'] },
  { name: 'Fenerbahçe', aliases: ['fenerbahçe', 'fenerbahce', 'fener', 'fb'] },
  { name: 'Beşiktaş', aliases: ['beşiktaş', 'besiktas', 'bjk'] },
  { name: 'Trabzonspor', aliases: ['trabzonspor'] },
  { name: 'Başakşehir', aliases: ['başakşehir', 'basaksehir'] },
  { name: 'Samsunspor', aliases: ['samsunspor'] },
  { name: 'Konyaspor', aliases: ['konyaspor'] },
  { name: 'Antalyaspor', aliases: ['antalyaspor'] },
  { name: 'Alanyaspor', aliases: ['alanyaspor'] },
  { name: 'Kasımpaşa', aliases: ['kasımpaşa', 'kasimpasa'] },
  { name: 'Çaykur Rizespor', aliases: ['çaykur rizespor', 'caykur rizespor', 'rizespor'] },
  { name: 'Gaziantep FK', aliases: ['gaziantep fk', 'gaziantep'] },
  { name: 'Kayserispor', aliases: ['kayserispor'] },
  { name: 'Eyüpspor', aliases: ['eyüpspor', 'eyupspor'] },
  { name: 'Sivasspor', aliases: ['sivasspor'] },
  { name: 'Göztepe', aliases: ['göztepe', 'goztepe'] },
  { name: 'Bodrum FK', aliases: ['bodrum fk', 'bodrumspor'] },
  { name: 'Hatayspor', aliases: ['hatayspor'] },
  { name: 'Adana Demirspor', aliases: ['adana demirspor'] },
  { name: 'Ankaragücü', aliases: ['ankaragücü', 'ankaragucu'] },
  { name: 'Kocaelispor', aliases: ['kocaelispor'] },
  { name: 'Fatih Karagümrük', aliases: ['karagümrük', 'karagumruk'] },
  { name: 'Gençlerbirliği', aliases: ['gençlerbirliği', 'genclerbirligi'] },
  { name: 'Bursaspor', aliases: ['bursaspor'] },
  { name: 'Amedspor', aliases: ['amedspor'] },
  { name: 'Pendikspor', aliases: ['pendikspor'] },
  { name: 'Istanbulspor', aliases: ['istanbulspor'] },

  // İspanya
  { name: 'Real Madrid', aliases: ['real madrid'] },
  { name: 'Barcelona', aliases: ['barcelona', 'barça', 'barca'] },
  { name: 'Atlético Madrid', aliases: ['atletico madrid', 'atlético madrid', 'atletico'] },
  { name: 'Sevilla', aliases: ['sevilla'] },
  { name: 'Valencia', aliases: ['valencia'] },
  { name: 'Villarreal', aliases: ['villarreal'] },
  { name: 'Real Sociedad', aliases: ['real sociedad'] },
  { name: 'Athletic Bilbao', aliases: ['athletic bilbao', 'athletic club'] },
  { name: 'Real Betis', aliases: ['real betis'] },

  // İngiltere
  { name: 'Manchester City', aliases: ['manchester city', 'man city'] },
  { name: 'Manchester United', aliases: ['manchester united', 'man united', 'man utd'] },
  { name: 'Liverpool', aliases: ['liverpool'] },
  { name: 'Chelsea', aliases: ['chelsea'] },
  { name: 'Arsenal', aliases: ['arsenal'] },
  { name: 'Tottenham', aliases: ['tottenham', 'spurs'] },
  { name: 'Newcastle United', aliases: ['newcastle'] },
  { name: 'Aston Villa', aliases: ['aston villa'] },
  { name: 'West Ham', aliases: ['west ham'] },
  { name: 'Everton', aliases: ['everton'] },
  { name: 'Brighton', aliases: ['brighton'] },
  { name: 'Leicester City', aliases: ['leicester'] },

  // Almanya
  { name: 'Bayern Münih', aliases: ['bayern münih', 'bayern munih', 'bayern munich', 'bayern'] },
  { name: 'Borussia Dortmund', aliases: ['borussia dortmund', 'dortmund'] },
  { name: 'Bayer Leverkusen', aliases: ['bayer leverkusen', 'leverkusen'] },
  { name: 'RB Leipzig', aliases: ['rb leipzig', 'leipzig'] },
  { name: 'Eintracht Frankfurt', aliases: ['eintracht frankfurt'] },

  // Fransa
  { name: 'PSG', aliases: ['psg', 'paris saint-germain', 'paris saint germain'] },
  { name: 'Marsilya', aliases: ['marsilya', 'marseille'] },
  { name: 'Monaco', aliases: ['monaco'] },
  { name: 'Lyon', aliases: ['olympique lyon', 'lyon'] },
  { name: 'Lille', aliases: ['lille'] },

  // İtalya
  { name: 'Juventus', aliases: ['juventus', 'juve'] },
  { name: 'Inter', aliases: ['inter'] },
  { name: 'AC Milan', aliases: ['ac milan', 'rossoneri'] },
  { name: 'Napoli', aliases: ['napoli'] },
  { name: 'Roma', aliases: ['roma'] },
  { name: 'Lazio', aliases: ['lazio'] },
  { name: 'Atalanta', aliases: ['atalanta'] },
  { name: 'Fiorentina', aliases: ['fiorentina'] },

  // Diğer
  { name: 'Ajax', aliases: ['ajax'] },
  { name: 'PSV', aliases: ['psv'] },
  { name: 'Feyenoord', aliases: ['feyenoord'] },
  { name: 'Benfica', aliases: ['benfica'] },
  { name: 'Porto', aliases: ['porto'] },
  { name: 'Sporting CP', aliases: ['sporting cp', 'sporting lizbon', 'sporting'] },
  { name: 'Celtic', aliases: ['celtic'] },
  { name: 'Rangers', aliases: ['rangers'] },
  { name: 'Shakhtar Donetsk', aliases: ['shakhtar', 'shaktar'] },
  { name: 'Al-Nassr', aliases: ['al-nassr', 'al nassr'] },
  { name: 'Al-Hilal', aliases: ['al-hilal', 'al hilal'] },
  { name: 'Al-Ittihad', aliases: ['al-ittihad', 'al ittihad'] },
  { name: 'Al-Ahli', aliases: ['al-ahli', 'al ahli'] }
];
