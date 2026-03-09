import url from "node:url"
import { type HandleRequestProps, SdkException } from "@aha.chat/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import { WhatsAppAPI as Middleware } from "whatsapp-api-js/middleware/next"
import type { GetParams } from "whatsapp-api-js/types"
import { DEFAULT_API_VERSION } from "../constants"
import type { WhatsappConfig } from "../schemas"

export const webhookHandler = async (
  props: HandleRequestProps<WhatsappConfig>,
) => {
  const { version = DEFAULT_API_VERSION } = props.config
  const middleware = new Middleware({
    token: "",
    appSecret: props.config.clientSecret as string,
    webhookVerifyToken: props.config.verifyToken as string,
    v: version as string,
    // biome-ignore lint/suspicious/noExplicitAny: safe pass value
    secure: false as any,
  })

  if (props.req.method === "GET") {
    const parsedUrl = url.parse(props.req.url, true) // true to parse query string into an object

    return await middleware.get(parsedUrl.query as GetParams)
  }

  if (props.req.method === "POST") {
    try {
      const result = await new Promise<OnMessageArgs | null>(
        (resolve, reject) => {
          middleware.on.message = (args: OnMessageArgs) => {
            resolve(args)
          }
          middleware.on.sent = () => {
            resolve(null)
          }
          middleware.on.status = () => {
            resolve(null)
          }
          middleware.handle_post(props.req).then((rs) => {
            if (rs !== 200) {
              reject(new SdkException("Failed to handle webhook"))
            }
          })

          setTimeout(() => {
            resolve(null)
          }, 300)
        },
      )

      if (result?.message) {
        await props.queue?.add("incomingMessage", {
          type: "incomingMessage",
          data: {
            integrationType: "whatsapp",
            integrationIdentifier: result.phoneID,
            payload: result,
          },
        })
      }

      return "ok"
    } catch (_error) {
      throw new SdkException("Failed to handle webhook")
    }
  }

  throw SdkException.methodNotImplemented()
}
