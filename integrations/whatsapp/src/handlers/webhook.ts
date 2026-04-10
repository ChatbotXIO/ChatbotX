import {
  type HandleRequestProps,
  type ReceivedMessageProps,
  SdkException,
} from "@chatbotx.io/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import { WhatsAppAPI as Middleware } from "whatsapp-api-js/middleware/next"
import type { GetParams } from "whatsapp-api-js/types"
import { DEFAULT_API_VERSION } from "../constants"
import type { WhatsappConfig } from "../schema"

type StatusEvent = {
  phoneID: string
  id: string
  status: "delivered" | "failed" | "read" | "sent"
  timestamp: string
  recipient_id: string
}

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
    const url = new URL(props.req.url)
    return await middleware.get(url.searchParams as unknown as GetParams)
  }

  if (props.req.method === "POST") {
    try {
      const result = await new Promise<
        | { type: "message"; data: OnMessageArgs }
        | { type: "status"; data: StatusEvent }
        | null
      >((resolve, reject) => {
        middleware.on.message = (args: OnMessageArgs) => {
          resolve({ type: "message", data: args })
        }
        middleware.on.sent = () => {
          resolve(null)
        }
        // biome-ignore lint/suspicious/noExplicitAny: whatsapp-api-js library type mismatch
        middleware.on.status = (args: any) => {
          resolve({ type: "status", data: args as StatusEvent })
        }
        middleware.handle_post(props.req).then((rs) => {
          if (rs !== 200) {
            reject(new SdkException("Failed to handle webhook"))
          }
        })

        setTimeout(() => {
          resolve(null)
        }, 300)
      })

      if (result?.type === "message" && result.data.message) {
        await props.queue?.add("incomingMessage", {
          type: "incomingMessage",
          data: {
            integrationType: "whatsapp",
            integrationIdentifier: result.data.phoneID,
            payload: result.data,
          } as ReceivedMessageProps,
        })
      }

      if (result?.type === "status") {
        const statusData = result.data

        if (
          statusData.status === "delivered" ||
          statusData.status === "failed"
        ) {
          await props.queue?.add("messageStatus", {
            type: "messageStatus",
            data: {
              integrationType: "whatsapp",
              payload: {
                messageId: statusData.id,
                status: statusData.status,
                timestamp: statusData.timestamp,
              },
            },
          })
        }
      }

      return "ok"
    } catch (_error) {
      throw new SdkException("Failed to handle webhook")
    }
  }

  throw SdkException.methodNotImplemented()
}
