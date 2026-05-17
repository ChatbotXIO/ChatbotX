import { HttpResponse, http } from "msw"

/**
 * MSW handlers for the Zalo OA API. Import in a test and register via
 * `server.use(...testHandlers)` to intercept outbound calls.
 */
export const testHandlers = [
  http.post("https://openapi.zalo.me/v3.0/oa/message/cs", () =>
    HttpResponse.json({
      error: 0,
      message: "Success",
      data: { message_id: "test" },
    }),
  ),
]
