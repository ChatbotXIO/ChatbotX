import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { inboxModel, integrationSmtpModel } from "@chatbotx.io/database/schema"
import { smtpHostMap } from "@chatbotx.io/integration-smtp"
import { createId } from "@chatbotx.io/utils"
import type { CreateSmtpRequest } from "../schemas/mutation"

export function createSmtp(workspaceId: string, input: CreateSmtpRequest) {
  let { host, port, ...rest } = input
  if (input.provider !== "other") {
    const defaultHostAndPort = smtpHostMap[input.provider]
    host = defaultHostAndPort.host
    port = defaultHostAndPort.port
  }

  return db.transaction(async (tx) => {
    const smtpId = createId()
    const name = input.username
    const inbox = await tx
      .insert(inboxModel)
      .values({
        id: smtpId,
        workspaceId,
        channel: channelTypes.enum.smtp,
        name,
        sourceId: smtpId,
      })
      .returning()
      .then((result) => result[0])

    await tx.insert(integrationSmtpModel).values({
      id: smtpId,
      name,
      workspaceId,
      inboxId: inbox.id,
      auth: {
        ...rest,
        host,
        port,
      },
    })

    return inbox
  })
}

export async function deleteSmtp(workspaceId: string, id: string) {
  const integration = await findOrFail({
    table: integrationSmtpModel,
    where: {
      id,
      workspaceId,
    },
    message: "SMTP integration not found",
  })

  await db
    .delete(integrationSmtpModel)
    .where(eq(integrationSmtpModel.id, integration.id))
}
