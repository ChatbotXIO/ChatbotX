import { HttpResponse, http } from "msw"
import { BUSINESS_API_URL } from "./constants"

export const testHandlers = [
  http.post(`${BUSINESS_API_URL}business/message/send/`, () =>
    HttpResponse.json({
      data: { message_id: "test-message-id" },
      error: { code: "ok", message: "" },
    }),
  ),
  http.post(`${BUSINESS_API_URL}business/message/media/upload/`, () =>
    HttpResponse.json({
      data: { media_id: "test-media-id" },
      error: { code: "ok", message: "" },
    }),
  ),
  http.post(`${BUSINESS_API_URL}tt_user/oauth2/token/`, () =>
    HttpResponse.json({
      code: 0,
      data: {
        access_token: "test-access-token",
        expires_in: 7200,
        open_id: "test-open-id",
        refresh_token: "test-refresh-token",
        refresh_token_expires_in: 31_536_000,
        scope: "message.list.read message.list.send message.list.manage",
      },
    }),
  ),
]
