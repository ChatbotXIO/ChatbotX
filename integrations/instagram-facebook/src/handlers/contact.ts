import type { ContactHandlers } from "@chatbotx.io/sdk"
import { getUserProfile } from "../apis/user"
import type { InstagramAuthValue } from "../schemas"

export const contactHandlers: Partial<ContactHandlers<InstagramAuthValue>> = {
  getProfile: async ({ ctx, data: { sourceId } }) =>
    await getUserProfile({ ctx, psid: sourceId }),
}
