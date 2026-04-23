import type { ContactHandlers } from "@chatbotx.io/sdk"
import { getUserProfile } from "../apis/user"
import type { TelegramAuthValue } from "../schema"

const getProfile: ContactHandlers<TelegramAuthValue>["getProfile"] = async ({
  ctx,
  data: { sourceId },
}) => await getUserProfile({ ctx, psid: sourceId })

export const contactHandlers: Partial<ContactHandlers<TelegramAuthValue>> = {
  getProfile,
}
