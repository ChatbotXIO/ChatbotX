import type { Context } from "@aha.chat/sdk"
import { createId } from "@paralleldrive/cuid2"
import type { ZaloAuthValue } from "../schemas/definition"

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
    const originPath = `public/chatbots/${ctx.chatbot?.id}/zalo/${ctx.auth.oaId}/${createId()}`
    const bytes = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") ?? "image/png"

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return originPath
  }
}
