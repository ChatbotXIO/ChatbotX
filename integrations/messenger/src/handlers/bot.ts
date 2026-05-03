import type { BotHandlers } from "@chatbotx.io/sdk"
import {
  addBranding,
  deleteMessengerProfileFields,
  updateMessengerProfile,
} from "../apis/page"
import type { MessengerAuthValue } from "../schema"

export const botHandlers: BotHandlers<MessengerAuthValue> = {
  updateProfile: async ({ ctx, data }) =>
    await updateMessengerProfile({ ctx, params: data }),
  addBranding: async ({ ctx, title, url }) => addBranding({ ctx, title, url }),
  deleteProfileFields: async ({ ctx, fields }) =>
    deleteMessengerProfileFields({ ctx, fields }),
}
