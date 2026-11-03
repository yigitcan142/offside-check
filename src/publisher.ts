export interface SendOptions {
  /** Yeni mesajı bu mesaja yanıt olarak gönder (aşama yükselmelerinde). */
  replyToMessageId?: number | null;
}

export interface Publisher {
  /** Mesaj kimliğini döner; gönderilemezse hata fırlatır. */
  send(html: string, options?: SendOptions): Promise<number | null>;
  edit(messageId: number, html: string): Promise<void>;
}

async function telegramRequest(token: string, method: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  }).catch((error: any) => { const c = error?.cause; throw new Error(`Telegram ${method} network error: ${error?.message} (${c?.code ?? ''} ${c?.message ?? ''})`); });

  const text = await response.text();
  let payload: { ok?: boolean; result?: any; description?: string } = {};
  try {
    payload = JSON.parse(text);
  } catch {
    // JSON değilse aşağıdaki hata mesajı ham metni gösterir.
  }

  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram ${method} ${response.status}: ${payload.description ?? text}`);
  }
  return payload.result;
}

const stripTags = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

export function createTelegramPublisher(env: NodeJS.ProcessEnv = process.env): Publisher {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not defined.');
  }

  // Biçimlendirme hatası (parse entities) olursa mesaj kaybolmasın: düz metin olarak yeniden dene.
  async function call(method: string, body: Record<string, unknown>): Promise<any> {
    try {
      return await telegramRequest(token as string, method, {
        chat_id: chatId,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...body
      });
    } catch (error: any) {
      if (/can't parse entities/i.test(error.message) && typeof body.text === 'string') {
        return telegramRequest(token as string, method, {
          chat_id: chatId,
          link_preview_options: { is_disabled: true },
          ...body,
          text: stripTags(body.text)
        });
      }
      throw error;
    }
  }

  return {
    async send(html, options = {}) {
      const body: Record<string, unknown> = { text: html };
      if (options.replyToMessageId) {
        body.reply_parameters = { message_id: options.replyToMessageId, allow_sending_without_reply: true };
      }
      const result = await call('sendMessage', body);
      return typeof result?.message_id === 'number' ? result.message_id : null;
    },
    async edit(messageId, html) {
      try {
        await call('editMessageText', { message_id: messageId, text: html });
      } catch (error: any) {
        if (/message is not modified/i.test(error.message)) return;
        throw error;
      }
    }
  };
}

/** DRY_RUN için: mesajları göndermek yerine ekrana yazar. */
export function createConsolePublisher(): Publisher {
  let nextId = 1;
  return {
    async send(html, options = {}) {
      const id = nextId++;
      console.log(`\n[DRY_RUN] Telegram mesajı #${id}${options.replyToMessageId ? ` (yanıt: #${options.replyToMessageId})` : ''}:\n${stripTags(html)}\n`);
      return id;
    },
    async edit(messageId, html) {
      console.log(`\n[DRY_RUN] Telegram mesajı #${messageId} güncellendi:\n${stripTags(html)}\n`);
    }
  };
}
