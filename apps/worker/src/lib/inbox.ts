import { Prisma, prisma } from "@aha.chat/database"
import type { ChatbotModel, InboxModel } from "@aha.chat/database/types"
import { type AuthValue, SdkException } from "@aha.chat/sdk"

export const getIntegrationAuth = async (
  inbox: InboxModel,
): Promise<AuthValue> => {
  const inboxName = inbox.inboxType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")

  const integrationTable = `Integration${inboxName}`
  const result = await prisma.$queryRaw<
    { auth: unknown }[]
  >`SELECT auth FROM ${Prisma.sql([`"${integrationTable}"`])} WHERE "inboxId" = ${Prisma.sql([`'${inbox.id}'`])} LIMIT 1`

  if (!result[0]) {
    throw new SdkException(
      `Unable to find integration auth for inboxType: ${inbox.inboxType}`,
    )
  }

  return result[0].auth as AuthValue
}

export const getInboxWithAuthFromInboxId = async (
  inboxId: string,
): Promise<{
  inbox: InboxModel & { chatbot: ChatbotModel }
  auth: AuthValue
}> => {
  const inbox = await prisma.inbox.findFirstOrThrow({
    where: {
      id: inboxId,
    },
    include: {
      chatbot: true,
    },
  })

  const auth = await getIntegrationAuth(inbox)
  return { inbox, auth }
}
