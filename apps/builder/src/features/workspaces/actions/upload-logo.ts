import { workspaceService } from "@chatbotx.io/business"
import type { DatabaseClient } from "@chatbotx.io/database/client"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem"
import type { AuthValue, Context } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"

type ProfilePicProvider<A extends AuthValue> = {
  runChannelHandler(
    group: "bot",
    name: "getProfilePictureUrl",
    props: { ctx: Context<A> },
  ): Promise<string | undefined>
}

export async function updateWorkspaceLogo<A extends AuthValue>(props: {
  id: string
  integration: ProfilePicProvider<A>
  ctx: Context<A>
  tx?: DatabaseClient
}): Promise<void> {
  const { id, integration, ctx, tx } = props

  const currentLogo = await workspaceService.findLogo({ id, tx })
  if (currentLogo === undefined || currentLogo) {
    return
  }

  let logo: string | undefined
  try {
    const url = await integration.runChannelHandler(
      "bot",
      "getProfilePictureUrl",
      {
        ctx,
      },
    )
    if (!url) {
      return
    }

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

  await workspaceService.setLogoIfEmpty({ id, logo, tx })
}
