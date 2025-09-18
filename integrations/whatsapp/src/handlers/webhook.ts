import { type HandleRequestProps, SdkException } from "@aha.chat/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import { WhatsAppAPI as Middleware } from "whatsapp-api-js/middleware/next"
import { DEFAULT_API_VERSION } from "whatsapp-api-js/types"
import type { WhatsappConfig } from "../schemas"

export const webhookHandler = async ({
  config,
  req,
  queue,
}: HandleRequestProps<WhatsappConfig>) => {
  const middleware = new Middleware({
    token: "",
    appSecret: "",
    v: DEFAULT_API_VERSION,
    secure: true,
    ...config,
  })
  middleware.on.message = async (props: OnMessageArgs) => {
    await queue?.add("RECEIVE_MESSAGE", {
      type: "RECEIVE_MESSAGE",
      data: {
        integrationName: "whatsapp",
        payload: props,
      },
    })
  }

  if (req.method === "GET") {
    return await middleware.handle_get(req)
  }

  if (req.method === "POST") {
    return await middleware.handle_post(req)
  }

  throw SdkException.methodNotImplemented()
}
