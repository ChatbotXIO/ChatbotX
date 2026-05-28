import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNull,
} from "@chatbotx.io/database/client"
import { workspaceModel } from "@chatbotx.io/database/schema"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem/node-upload"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import type { AuthValue, Context } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"

type ProfilePicProvider<A extends AuthValue> = {
  runChannelHandler(
    group: "bot",
    name: "getProfilePicURL",
    props: { ctx: Context<A> },
  ): Promise<string | undefined>
}

export async function updateWorkspaceLogo<A extends AuthValue>(props: {
  id: string
  integration: ProfilePicProvider<A>
  ctx: Context<A>
  tx?: DatabaseClient
}): Promise<void> {
  const { id, integration, ctx, tx = db } = props

  const url = await integration.runChannelHandler("bot", "getProfilePicURL", {
    ctx,
  })
  if (!url) {
    return
  }

  let logo: string | undefined
  try {
    const uploaded = await uploadFileFromUrl(
      url,
      `public/space/${id}/logos/${createId()}.jpg`,
    )
    logo = uploaded.originPath
  } catch {
    return
  }

  if (!logo) {
    return
  }

  await tx
    .update(workspaceModel)
    .set({ logo })
    .where(and(eq(workspaceModel.id, id), isNull(workspaceModel.logo)))
  await invalidateCacheByTags([`workspaces:${id}`])
}
