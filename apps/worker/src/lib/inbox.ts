import { db, sql } from "@aha.chat/database/client"
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
  const result = await db.execute(
    sql`select auth from ${integrationTable} where "inboxId" = ${inbox.id} limit 1`,
  )

  if (!result.rows[0]) {
    throw new SdkException(
      `Unable to find integration auth for inboxType: ${inbox.inboxType}`,
    )
  }

  return result.rows[0].auth as AuthValue
}

export const getInboxWithAuthFromInboxId = async (
  inboxId: string,
): Promise<{
  inbox: InboxModel & { chatbot: ChatbotModel }
  auth: AuthValue
}> => {
  const inbox = await db.query.inboxModel.findFirst({
    where: {
      id: inboxId,
    },
    with: {
      chatbot: true,
    },
  })
  if (!inbox) {
    throw new SdkException(`Inbox not found with id: ${inboxId}`)
  }

  const auth = await getIntegrationAuth(inbox)

  return { inbox, auth }
}
