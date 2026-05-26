import { connectChannelIntegration } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { ZaloCredential } from "@chatbotx.io/database/partials"
import { integrationZaloModel } from "@chatbotx.io/database/schema"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo"
import { redirect } from "next/navigation"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"

export async function connectZaloHandler({
  zaloSettings,
  workspaceId,
  ownerId,
  req,
}: {
  zaloSettings: ZaloCredential
  workspaceId: string
  ownerId: string
  req: Request
}) {
  const authValue = (await integrations.zalo.handleRequest({
    config: {
      ...zaloSettings,
      redirectUrl: new URL("/integrations/zalo/callback", req.url).toString(),
      stateParams: { workspaceId },
    },
    req,
  })) as ZaloAuthValue

  await db.transaction(async (tx) => {
    await connectChannelIntegration({
      tx,
      ownerId,
      inboxData: {
        workspaceId,
        name: authValue.metadata.oaName,
        channel: "zalo",
        sourceId: authValue.oaId,
      },
      insertIntegration: async (inboxId, wasCreated) => {
        if (!wasCreated) {
          redirect(
            `/space/${workspaceId}/settings/channels?channel=zalo&error=duplicated`,
          )
        }
        await tx.insert(integrationZaloModel).values({
          inboxId,
          workspaceId,
          oaId: authValue.oaId,
          auth: authValue,
          name: authValue.metadata.oaName,
        })
      },
    })
  })

  revalidateCacheTags(`workspaces:${workspaceId}#zalos`)
}
