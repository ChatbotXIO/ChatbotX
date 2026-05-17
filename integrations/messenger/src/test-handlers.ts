import { HttpResponse, http } from "msw"

/**
 * MSW handlers for Facebook Messenger (Graph API). Import in a test and
 * register via `server.use(...testHandlers)` to intercept outbound calls.
 */
export const testHandlers = [
  http.post("https://graph.facebook.com/:version/me/messages", () =>
    HttpResponse.json({
      recipient_id: "test-recipient",
      message_id: "test-message-id",
    }),
  ),
]
