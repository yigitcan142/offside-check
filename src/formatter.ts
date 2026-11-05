/** Telegram parse_mode: 'HTML' için metin ve nitelik değerlerini kaçışlar. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Sayısal skoru, "kesin bilgi" izlenimi vermeyen bir düzeye çevirir. */
export function confidenceLabel(score: number, sourceCount: number): string {
  const level = score >= 70 ? '🟢 Yüksek' : score >= 45 ? '🟡 Orta' : score >= 25 ? '🟠 Düşük' : '⚪ Söylenti';
  return `${level} · ${sourceCount} kaynak`;
}

export function formatTelegramHtml(analysis: any, sources: Array<any>): string {
  const { category, subjectName, subjectRole, fromClub, toClub, primaryClub, statusDescription, confidenceScore, summaryTr } = analysis;

  const sourceItem = (s: any) =>
    `<a href="${escapeHtml(s.tweetUrl)}">${escapeHtml(s.label ?? `@${s.username}`)}</a> (Tier ${escapeHtml(s.tier)} | ${escapeHtml(s.alignment)})`;

  let sourcesBlock = '';
  if (sources.length === 1) {
    sourcesBlock = `• <b>Kaynak:</b> ${sourceItem(sources[0])}`;
  } else {
    sourcesBlock = `• <b>Doğrulayan Kaynaklar (${sources.length}):</b>\n` +
      sources.map((s) => `  ▫️ ${sourceItem(s)}`).join('\n');
  }

  const primarySourceLink = sources[0]
    ? `\n🔗 <a href="${escapeHtml(sources[0].tweetUrl)}">Habere/Tweete Git</a>`
    : '';

  const clubName = primaryClub || toClub || fromClub || null;
  const roleLabel = subjectRole === 'Teknik Direktör' ? 'Teknik Direktör' :
                    subjectRole === 'Yönetici' ? 'Yönetici' : 'Oyuncu';
  const name = escapeHtml(subjectName);
  const status = escapeHtml(statusDescription || summaryTr);
  const score = escapeHtml(confidenceLabel(Number(confidenceScore) || 0, sources.length));

  if (category === 'TRANSFER' || category === 'CONTRACT_EXTENSION') {
    let clubLine = '';
    if (fromClub && toClub) {
      clubLine = `• <b>Kulüpler:</b> ${escapeHtml(fromClub)} ➔ ${escapeHtml(toClub)}\n`;
    } else if (toClub) {
      clubLine = `• <b>Kulüp:</b> ➔ ${escapeHtml(toClub)}\n`;
    } else if (fromClub) {
      clubLine = `• <b>Kulüp:</b> ${escapeHtml(fromClub)} (Ayrılık)\n`;
    } else if (clubName) {
      clubLine = `• <b>Kulüp:</b> ${escapeHtml(clubName)}\n`;
    }

    const heading = category === 'CONTRACT_EXTENSION' ? 'SÖZLEŞME' : 'TRANSFER';
    return `<b>${heading} | Güven: ${score}</b>\n` +
           `• <b>${roleLabel}:</b> ${name}\n` +
           `${clubLine}` +
           `• <b>Durum:</b> ${status}\n` +
           `${sourcesBlock}` +
           primarySourceLink;
  }

  const categoryTitles: Record<string, string> = {
    INJURY: 'SAKATLIK BİLGİSİ',
    SQUAD_STATUS: 'KADRO BİLGİSİ',
    SUSPENSION: 'CEZA BİLGİSİ',
    MANAGER_STAFF: 'TEKNİK HEYET / YÖNETİM'
  };

  const title = categoryTitles[category] || 'GELİŞME';
  const clubLine = clubName ? `• <b>Kulüp:</b> ${escapeHtml(clubName)}\n` : '• <b>Kulüp:</b> Belirtilmedi\n';

  return `<b>${title} | Güven: ${score}</b>\n` +
         `• <b>${roleLabel}:</b> ${name}\n` +
         `${clubLine}` +
         `• <b>Gelişme:</b> ${status}\n` +
         `${sourcesBlock}` +
         primarySourceLink;
}
