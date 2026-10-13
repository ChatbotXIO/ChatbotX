import type { Context } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { storeIncomingImage } from "@chatbotx.io/utils/store-incoming-image"
import type { ZaloAuthValue } from "../schema/definition"

export const fetchAndReuploadImage = async ({
  ctx,
  avatarUrl,
}: {
  ctx: Context<ZaloAuthValue>
  avatarUrl: string
}): Promise<string | undefined> => {
  const response = await fetch(avatarUrl, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (response.ok && response.body) {
    const stored = await storeIncomingImage({
      uploader: ctx.uploader,
      key: `${ctx.storagePrefix}/${createId()}`,
      bytes: await response.arrayBuffer(),
      mimeType: response.headers.get("content-type") ?? "image/png",
      profile: "avatar",
      acl: "public-read",
    })

    return stored.originPath
  }
}
