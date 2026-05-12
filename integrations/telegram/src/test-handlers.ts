import { HttpResponse, http } from "msw"

/**
 * MSW handlers for the Telegram Bot API. Import in a test and register via
 * `server.use(...testHandlers)` to intercept outbound Telegram calls.
 */
export const testHandlers = [
  http.post("https://api.telegram.org/bot:token/:method", () =>
    HttpResponse.json({
      ok: true,
      result: { message_id: 1, date: 0, chat: { id: 1, type: "private" } },
    }),
  ),
]
