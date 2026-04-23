import type { ContactHandlers } from "@chatbotx.io/sdk"
import { updateInstagramProfile } from "../apis/page"
import { getUserProfile } from "../apis/user"
import type { InstagramAuthValue } from "../schemas"

const update: ContactHandlers<InstagramAuthValue>["update"] = async (props) =>
  await updateInstagramProfile({ ctx: props.ctx, params: props.data })

export const contactHandlers: Partial<ContactHandlers<InstagramAuthValue>> = {
  getProfile: async ({ ctx, data: { sourceId } }) =>
    await getUserProfile({ ctx, psid: sourceId }),
  update,
}
