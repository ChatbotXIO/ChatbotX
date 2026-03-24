import { db } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import { inboxModel, integrationZaloModel } from "@aha.chat/database/schema"
import type { OrganizationSettings } from "@aha.chat/database/types"
import type { ZaloAuthValue } from "@aha.chat/integration-zalo"
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
        name: authValue.metadata.oaName,
        channel: "zalo",
        sourceId: authValue.oaId,
      })
      .onConflictDoUpdate({
        target: [inboxModel.channel, inboxModel.sourceId],
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
