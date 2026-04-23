import type { ContactHandlers } from "@chatbotx.io/sdk"
import { getUserProfile } from "../apis/user"
import type { MessengerAuthValue } from "../schema"

export const contactHandlers: Partial<ContactHandlers<MessengerAuthValue>> = {
  getProfile: getUserProfile,
}
