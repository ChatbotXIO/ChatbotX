import { HttpResponse, http } from "msw"

/**
 * MSW handlers for every LINE endpoint the integration uses. Register via
 * `server.use(...testHandlers)` to intercept outbound LINE calls.
 */
export const testHandlers = [
  http.post("https://api.line.me/v2/oauth/accessToken", () =>
    HttpResponse.json({
      access_token: "test-access-token",
      expires_in: 2_592_000,
      token_type: "Bearer",
    }),
  ),
  http.post("https://api.line.me/v2/oauth/revoke", () => HttpResponse.json({})),
  http.get("https://api.line.me/v2/bot/info", () =>
    HttpResponse.json({
      userId: "Ubot",
      basicId: "@testbot",
      displayName: "Test Bot",
    }),
  ),
  http.put("https://api.line.me/v2/bot/channel/webhook/endpoint", () =>
    HttpResponse.json({}),
  ),
  http.get("https://api.line.me/v2/bot/channel/webhook/endpoint", () =>
    HttpResponse.json({ endpoint: "https://example.com/hook", active: true }),
  ),
  http.post("https://api.line.me/v2/bot/channel/webhook/test", () =>
    HttpResponse.json({
      success: true,
      timestamp: "2026-01-01T00:00:00Z",
      statusCode: 200,
      reason: "OK",
      detail: "200",
    }),
  ),
  http.post("https://api.line.me/v2/bot/message/reply", () =>
    HttpResponse.json({ sentMessages: [{ id: "1" }] }),
  ),
  http.post("https://api.line.me/v2/bot/message/push", () =>
    HttpResponse.json({ sentMessages: [{ id: "1" }] }),
  ),
  http.get("https://api.line.me/v2/bot/profile/:userId", () =>
    HttpResponse.json({ userId: "U1", displayName: "User One" }),
  ),
  http.get("https://api-data.line.me/v2/bot/message/:messageId/content", () =>
    HttpResponse.arrayBuffer(new ArrayBuffer(8), {
      headers: { "Content-Type": "image/jpeg" },
    }),
  ),
]
