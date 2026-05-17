import type { BotHandlers } from "@chatbotx.io/sdk"
import {
  addBranding,
  deleteInstagramProfileFields,
  updateInstagramProfile,
} from "../apis/page"
import type { InstagramAuthValue } from "../schemas"

export const botHandlers: BotHandlers<InstagramAuthValue> = {
  updateProfile: async ({ ctx, data }) =>
    await updateInstagramProfile({ ctx, params: data }),
  addBranding: async ({ ctx, title, url }) => addBranding({ ctx, title, url }),
  deleteProfileFields: async ({ ctx, fields }) =>
    deleteInstagramProfileFields({ ctx, fields }),
}
