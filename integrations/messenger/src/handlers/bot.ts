import type { BotHandlers } from "@chatbotx.io/sdk"
import { updateMessengerProfile } from "../apis/page"
import { getUserProfile } from "../apis/user"
import type { MessengerAuthValue } from "../schema"

export const botHandlers: BotHandlers<MessengerAuthValue> = {
  getProfile: async ({ ctx, data }) => {
    return await getUserProfile({ ctx, data })
  },
  updateProfile: async ({ ctx, data }) => {
    return await updateMessengerProfile({ ctx, params: data })
  },
}
