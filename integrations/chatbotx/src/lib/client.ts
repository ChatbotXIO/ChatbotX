import type { AuthValue, Context } from "@aha.chat/sdk"
import ky, { type KyInstance } from "ky"
import { chatbotxAuthSchema } from "../auth"

export const getRealtimeClient = (ctx: Context<AuthValue>): KyInstance => {
  const authSchema = chatbotxAuthSchema.parse(ctx.auth)

  return ky.create({
    headers: {
      "X-API-KEY": authSchema.apiKey,
    },
    prefixUrl: authSchema.websocketUrl,
  })
}
