// Telegram notifications — backend posts messages to a user's chat
// via the Telegram Bot API. Token + chat ID stay server-side (env).
// Full Bot API docs: https://core.telegram.org/bots/api#sendmessage

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramResult {
  ok: boolean;
  status: number;
  body: string;
  messageId?: number;
}

export async function sendTelegramMessage(
  text: string,
  cfg: TelegramConfig,
): Promise<TelegramResult> {
  if (!cfg.botToken || !cfg.chatId) {
    throw new Error("Telegram not configured (need TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)");
  }
  if (!text || text.length === 0) {
    throw new Error("Telegram message text is empty");
  }
  // Telegram rejects messages over 4096 chars; truncate with a marker.
  const body = text.length > 4000 ? text.slice(0, 3990) + "\n… [truncated]" : text;

  const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: cfg.chatId,
      text: body,
      disable_web_page_preview: true,
    }),
  });
  const payload = await res.json().catch(() => ({} as { ok?: boolean; result?: { message_id?: number }; description?: string }));
  return {
    ok: res.ok && payload.ok !== false,
    status: res.status,
    body: payload.description ?? (res.ok ? "sent" : `HTTP ${res.status}`),
    messageId: payload.result?.message_id,
  };
}
