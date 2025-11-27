import { IntegrationType, type Prisma, prisma } from "@aha.chat/database"
import { InboxStatus } from "@aha.chat/database/enums"
import type { OrganizationSettings } from "@aha.chat/database/types"
import type { ZaloAuthValue } from "@aha.chat/integration-zalo"
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

  await prisma.$transaction(async (tx) => {
    const inbox = await tx.inbox.upsert({
      where: {
        chatbotId_inboxType_sourceId: {
          chatbotId,
          inboxType: IntegrationType.zalo,
          sourceId: authValue.oaId,
        },
      },
      update: {
        status: InboxStatus.connected,
      },
      create: {
        chatbotId,
        inboxType: IntegrationType.zalo,
        sourceId: authValue.oaId,
      },
    })
    await tx.integrationZalo.create({
      data: {
        inboxId: inbox.id,
        chatbotId,
        oaId: authValue.oaId,
        auth: authValue as unknown as Prisma.InputJsonValue,
        name: authValue.metadata.oaName,
      },
    })
  })

  revalidateCacheTags(`chatbots:${chatbotId}#zalos`)
}
