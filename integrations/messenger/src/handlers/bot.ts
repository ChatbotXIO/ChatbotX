import type { BotHandlers } from "@chatbotx.io/sdk"
import {
  createCustomLabel,
  deleteCustomLabel,
  getUserLabels,
} from "../apis/label"
import {
  addBranding,
  deleteProfileFields as deleteProfileFieldsApi,
  getAccountPictureUrl,
  updateProfile as updateProfileApi,
} from "../apis/page"
import type { MessengerAuthValue } from "../schema"

export const botHandlers: BotHandlers<MessengerAuthValue> = {
  updateProfile: async ({ ctx, data }) =>
    await updateProfileApi({ ctx, params: data }),
  addBranding: async ({ ctx, title, url }) => addBranding({ ctx, title, url }),
  deleteProfileFields: async ({ ctx, fields }) =>
    deleteProfileFieldsApi({ ctx, fields }),
  getProfilePictureUrl: async ({ ctx }) => getAccountPictureUrl({ ctx }),
  createLabel: async ({ ctx, data }) => {
    const { id } = await createCustomLabel({
      ctx,
      pageId: data.pageId,
      name: data.name,
    })
    return { id, name: data.name }
  },
  listLabels: async ({ ctx, data }) => {
    const labels = await getUserLabels({ ctx, psid: data.sourceId })
    return labels.map((label) => ({
      id: label.id,
      name: label.page_label_name,
    }))
  },
  deleteLabel: async ({ ctx, data }) => {
    await deleteCustomLabel({ ctx, labelId: data.labelId })
  },
}
