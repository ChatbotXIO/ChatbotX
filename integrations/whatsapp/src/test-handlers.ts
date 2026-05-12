import { HttpResponse, http } from "msw"

/**
 * MSW handlers for the WhatsApp Cloud API (Meta Graph). Import in a test and
 * register via `server.use(...testHandlers)` to intercept outbound calls.
 */
export const testHandlers = [
  http.post("https://graph.facebook.com/:version/:phoneNumberId/messages", () =>
    HttpResponse.json({
      messaging_product: "whatsapp",
      contacts: [{ input: "+1234567890", wa_id: "1234567890" }],
      messages: [{ id: "wamid.test" }],
    }),
  ),

  http.post("https://graph.facebook.com/:version/:phoneNumberId/media", () =>
    HttpResponse.json({
      id: "test-media-id",
    }),
  ),
]
