import { db, findOrFail, sql } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { inboxModel, workspaceModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  InboxModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { integration as integrationChatbotx } from "@chatbotx.io/integration-chatbotx"
import { integration as integrationGoogleSheets } from "@chatbotx.io/integration-google-sheets"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import { integration as integrationSmtp } from "@chatbotx.io/integration-smtp"
import { integration as integrationWhatsapp } from "@chatbotx.io/integration-whatsapp"
import { integration as integrationZalo } from "@chatbotx.io/integration-zalo"
import {
  type AuthValue,
  type Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"

export const allIntegrations: Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: safe pass value
  Integration<IntegrationDefinition<any, any, any>> | undefined
> = {
  gemini: undefined,
  googleSheets: integrationGoogleSheets,
  messenger: integrationMessenger,
  openai: undefined,
  webchat: undefined,
  whatsapp: integrationWhatsapp,
  zalo: integrationZalo,
  chatbotx: integrationChatbotx,
  smtp: integrationSmtp,
}

export const integrationService = {
  identifyInboxAndIntegrationAuthFromIdentifier: async (
    integrationType: IntegrationType,
    integrationIdentifier: string,
  ): Promise<{
    workspace: WorkspaceModel
    inbox: InboxModel
    integrationAuth: AuthValue
  }> => {
    let modelName: string | null = null
    let columnName: string | null = null

    switch (integrationType) {
      case "whatsapp": {
        modelName = "IntegrationWhatsapp"
        columnName = "phoneNumberId"
        break
      }
      case "messenger": {
        modelName = "IntegrationMessenger"
        columnName = "pageId"
        break
      }
      case "zalo": {
        modelName = "IntegrationZalo"
        columnName = "oaId"
        break
      }
      default:
        throw new Error(`Unsupported integration: ${integrationType}`)
    }

    const result = await db.execute<{
      auth: AuthValue
      workspaceId: string
      inboxId: string
    }>(
      sql`SELECT auth, "workspaceId", "inboxId" FROM ${sql.identifier(modelName)} WHERE ${sql.identifier(columnName)} = ${integrationIdentifier} LIMIT 1`,
    )

    if (!result.rows[0]) {
      throw new Error(
        `Integration not found: ${integrationType} ${integrationIdentifier}`,
      )
    }

    const workspace = await findOrFail({
      table: workspaceModel,
      where: { id: result.rows[0].workspaceId },
      message: "Workspace not found",
    })

    const inbox = await findOrFail({
      table: inboxModel,
      where: { id: result.rows[0].inboxId },
      message: "Inbox not found",
    })

    return {
      integrationAuth: result.rows[0].auth as AuthValue,
      workspace,
      inbox,
    }
  },

  getIntegrationAuthFromContactInbox: async (
    contactInbox: ContactInboxModel,
  ): Promise<AuthValue> => {
    const inboxName = contactInbox.channel
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("")

    const integrationTable = `Integration${inboxName}`
    const result = await db.execute<{ auth: AuthValue }>(
      sql`SELECT auth FROM ${sql.identifier(integrationTable)} WHERE "inboxId" = ${contactInbox.inboxId} LIMIT 1`,
    )

    if (!result.rows[0]) {
      throw new SdkException(
        `Unable to find integration auth for channel: ${contactInbox.channel}`,
      )
    }

    return result.rows[0].auth
  },
}
