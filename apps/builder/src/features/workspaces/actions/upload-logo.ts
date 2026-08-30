import { auditService } from "@chatbotx.io/business/audit"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNull,
} from "@chatbotx.io/database/client"
import {
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { uploadFileFromUrl } from "@chatbotx.io/filesystem"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
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
  const { id, integration, ctx } = props
  const client = props.tx ?? db

  const workspace = await client.query.workspaceModel.findFirst({
    where: { id },
    columns: { logo: true },
  })
  if (!workspace || workspace.logo) {
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

  const updated = await client
    .update(workspaceModel)
    .set({ logo })
    .where(and(eq(workspaceModel.id, id), isNull(workspaceModel.logo)))
    .returning({ id: workspaceModel.id })

  if (updated.length > 0) {
    const workspaceMembers = await client
      .select({ userId: workspaceMemberModel.userId })
      .from(workspaceMemberModel)
      .where(eq(workspaceMemberModel.workspaceId, id))

    await invalidateCacheByTags([
      `workspaces:${id}`,
      ...workspaceMembers.map(
        (workspaceMember) =>
          `users:${workspaceMember.userId}:workspace-members`,
      ),
    ])

    if (!props.tx) {
      await auditService.record({
        workspaceId: id,
        action: "update",
        detail: "changed the workspace logo",
      })
    }
  }
}
