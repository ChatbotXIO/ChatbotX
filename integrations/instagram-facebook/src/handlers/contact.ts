import type { ContactHandlers } from "@chatbotx.io/sdk"
import { getContactProfilePicUrl, getUserProfile } from "../apis/user"
import type { InstagramAuthValue } from "../schema"

export const contactHandlers: Partial<ContactHandlers<InstagramAuthValue>> = {
  getProfile: async ({ ctx, data: { sourceId } }) =>
    await getUserProfile({ ctx, psid: sourceId }),
  getContactProfilePicUrl: async ({ ctx, data: { sourceId } }) =>
    await getContactProfilePicUrl({ ctx, psid: sourceId }),
}
