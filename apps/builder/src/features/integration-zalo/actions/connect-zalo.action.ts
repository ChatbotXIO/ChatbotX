import { db } from "@chatbotx.io/database/client"
import { InboxStatus } from "@chatbotx.io/database/enums"
import { inboxModel, integrationZaloModel } from "@chatbotx.io/database/schema"
import type { OrganizationSettings } from "@chatbotx.io/database/types"
import type { ZaloAuthValue } from "@chatbotx.io/integration-zalo"
import { createId } from "@paralleldrive/cuid2"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"

export async function connectZaloHandler({
  zaloSettings,
  chatbotId,
  req,
}: {
  zaloSettings: NonNullable<OrganizationSettings["zalo"]>
  chatbotId: string
  req: Request
}) {
  const authValue = (await integrations.zalo.handleRequest({
    config: {
      ...zaloSettings,
      redirectUrl: new URL("/integrations/zalo/callback", req.url).toString(),
      stateParams: {
        chatbotId,
      },
    },
    req,
  })) as ZaloAuthValue

  await db.transaction(async (tx) => {
    const inbox = await tx
      .insert(inboxModel)
      .values({
        id: createId(),
        chatbotId,
        inboxType: "zalo",
        sourceId: authValue.oaId,
      })
      .onConflictDoUpdate({
        target: [
          inboxModel.chatbotId,
          inboxModel.inboxType,
          inboxModel.sourceId,
        ],
        set: {
          status: InboxStatus.connected,
        },
      })
      .returning()
      .then((result) => result[0])

    await tx.insert(integrationZaloModel).values({
      id: createId(),
      inboxId: inbox.id,
      chatbotId,
      oaId: authValue.oaId,
      auth: authValue,
      name: authValue.metadata.oaName,
    })
  })

  revalidateCacheTags(`chatbots:${chatbotId}#zalos`)
}
