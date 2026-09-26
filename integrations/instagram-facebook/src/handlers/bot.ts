import type { BotHandlers } from "@chatbotx.io/sdk"
import {
  addBranding,
  deleteProfileFields as deleteProfileFieldsApi,
  getAccountPictureUrl,
  updateProfile as updateProfileApi,
} from "../apis/page"
import type { InstagramAuthValue } from "../schema"

export const botHandlers: BotHandlers<InstagramAuthValue> = {
  updateProfile: async ({ ctx, data }) =>
    await updateProfileApi({ ctx, params: data }),
  addBranding: async ({ ctx, title, url }) => addBranding({ ctx, title, url }),
  deleteProfileFields: async ({ ctx, fields }) =>
    deleteProfileFieldsApi({ ctx, fields }),
  getProfilePictureUrl: async ({ ctx }) => getAccountPictureUrl({ ctx }),
}
