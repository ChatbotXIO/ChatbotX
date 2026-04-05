import { db, sql } from "@chatbotx.io/database/client"
import type { InboxModel, WorkspaceModel } from "@chatbotx.io/database/types"
import { type AuthValue, SdkException } from "@chatbotx.io/sdk"

export const getIntegrationAuth = async (
  inbox: InboxModel,
): Promise<AuthValue> => {
  const inboxName = inbox.channel
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")

  const integrationTable = `Integration${inboxName}`
  const result = await db.execute(
    sql`select auth from ${sql.identifier(integrationTable)} where "inboxId" = ${inbox.id} limit 1`,
  )

  if (!result.rows[0]) {
    throw new SdkException(
      `Unable to find integration auth for channel: ${inbox.channel}`,
    )
  }

  return result.rows[0].auth as AuthValue
}

export const getInboxWithAuthFromInboxId = async (
  inboxId: string,
): Promise<{
  inbox: InboxModel & { workspace: WorkspaceModel }
  auth: AuthValue
}> => {
  const inbox = await db.query.inboxModel.findFirst({
    where: {
      id: inboxId,
    },
    with: {
      workspace: true,
    },
  })
  if (!inbox) {
    throw new SdkException(`Inbox not found with id: ${inboxId}`)
  }

  const auth = await getIntegrationAuth(inbox)

  return { inbox, auth }
}
