import type { BotHandlers } from "@chatbotx.io/sdk"
import { getBusinessProfilePictureUrl } from "../api/phone-number"
import type { WhatsappAuthValue } from "../schema"

export const botHandlers: Partial<BotHandlers<WhatsappAuthValue>> = {
  getProfilePictureUrl: async ({ ctx }) =>
    getBusinessProfilePictureUrl({ ctx }),
}
