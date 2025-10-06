import { type HandleRequestProps, SdkException } from "@aha.chat/sdk"
import type { OnMessageArgs } from "whatsapp-api-js/emitters"
import { WhatsAppAPI as Middleware } from "whatsapp-api-js/middleware/next"
import z from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import type { WhatsappConfig } from "../schemas"

export const webhookHandler = async (
  props: HandleRequestProps<WhatsappConfig>,
) => {
  if (props.req.method === "GET") {
    return await handleGetRequest(props)
  }

  if (props.req.method === "POST") {
    return await handlePostRequest(props)
  }

  throw SdkException.methodNotImplemented()
}

async function handleGetRequest({
  config,
  req,
}: HandleRequestProps<WhatsappConfig>) {
  // Validate the request
  const getRequestSchema = z.object({
    "hub.challenge": z.string().min(1),
    "hub.mode": z.literal("subscribe"),
    "hub.verify_token": z.literal(config.verifyToken),
  })
  const url = new URL(req.url)
  const { data } = getRequestSchema.safeParse(
    Object.fromEntries(url.searchParams),
  )

  if (!data) {
    throw new SdkException("Invalid webhook verification parameters")
  }

  return await data["hub.challenge"]
}

async function handlePostRequest({
  config,
  req,
  queue,
}: HandleRequestProps<WhatsappConfig>) {
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
