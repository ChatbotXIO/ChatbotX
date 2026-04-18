import type { ContactHandlers } from "@chatbotx.io/sdk"
import { updateInstagramProfile } from "../apis/page"
import type { InstagramAuthValue } from "../schemas"

const update: ContactHandlers<InstagramAuthValue>["update"] = async (props) =>
  await updateInstagramProfile({ ctx: props.ctx, params: props.data })

export const contactHandlers = {
  update,
}
