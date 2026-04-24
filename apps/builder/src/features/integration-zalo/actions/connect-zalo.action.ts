import { db } from "@chatbotx.io/database/client"
import {
  inboxStatuses,
  type OrganizationSettings,
} from "@chatbotx.io/database/partials"
import { inboxModel, integrationZaloModel } from "@chatbotx.io/database/schema"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo"
import { redirect } from "next/navigation"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"

export async function connectZaloHandler({
  zaloSettings,
  workspaceId,
  req,
}: {
  zaloSettings: NonNullable<OrganizationSettings["zalo"]>
  workspaceId: string
  req: Request
}) {
  const authValue = (await integrations.zalo.handleRequest({
    config: {
      ...zaloSettings,
      redirectUrl: new URL("/integrations/zalo/callback", req.url).toString(),
      stateParams: {
        workspaceId,
      },
    },
    req,
  })) as ZaloAuthValue

  await db.transaction(async (tx) => {
    const inbox = await tx
      .insert(inboxModel)
      .values({
        workspaceId,
        name: authValue.metadata.oaName,
        channel: "zalo",
        sourceId: authValue.oaId,
      })
      .onConflictDoUpdate({
        target: [
          inboxModel.workspaceId,
          inboxModel.channel,
          inboxModel.sourceId,
        ],
        set: {
          status: inboxStatuses.enum.connected,
        },
      })
      .returning()
      .then((result) => result[0])

    const isExistingIntegration = await tx.query.integrationZaloModel.findFirst(
      {
        where: {
          inboxId: inbox.id,
          oaId: authValue.oaId,
        },
      },
    )

    if (isExistingIntegration) {
      redirect(
        `/space/${workspaceId}/settings/channels?channel=zalo&error=duplicated`,
      )
    }

    await tx.insert(integrationZaloModel).values({
      inboxId: inbox.id,
      workspaceId,
      oaId: authValue.oaId,
      auth: authValue,
      name: authValue.metadata.oaName,
    })
  })

  revalidateCacheTags(`workspaces:${workspaceId}#zalos`)
}
