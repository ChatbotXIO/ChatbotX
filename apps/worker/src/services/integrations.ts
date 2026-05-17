import {
  buildContext,
  type IntegrationContext,
  organizationService,
  workspaceService,
} from "@chatbotx.io/business"
import { db, findOrFail, sql } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { inboxModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  InboxModel,
  OrganizationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { integration as integrationChatbotx } from "@chatbotx.io/integration-chatbotx"
import { integration as integrationGoogleSheets } from "@chatbotx.io/integration-google-sheets"
import { integration as integrationInstagram } from "@chatbotx.io/integration-instagram"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import { integration as integrationSmtp } from "@chatbotx.io/integration-smtp"
import { integration as integrationTelegram } from "@chatbotx.io/integration-telegram"
import { integration as integrationWebchat } from "@chatbotx.io/integration-webchat"
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
  webchat: integrationWebchat,
  whatsapp: integrationWhatsapp,
  telegram: integrationTelegram,
  zalo: integrationZalo,
  chatbotx: integrationChatbotx,
  smtp: integrationSmtp,
  instagram: integrationInstagram,
}

export const integrationService = {
  identifyInboxAndIntegrationAuthFromIdentifier: async (
    integrationType: IntegrationType,
    integrationIdentifier: string,
  ): Promise<{
    workspace: WorkspaceModel
    inbox: InboxModel
    integrationRow: {
      id: string
      auth: AuthValue
      inboxId: string
      [x: string]: unknown
    }
  }> => {
    let modelName: string | null = null
    let columnName: string | null = null

    switch (integrationType) {
      case "whatsapp": {
        modelName = "IntegrationWhatsapp"
        columnName = "phoneNumberId"
        break
      }
      case "telegram": {
        modelName = "IntegrationTelegram"
        columnName = "botId"
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
      case "instagram": {
        modelName = "IntegrationInstagram"
        columnName = "pageId"
        break
      }
      case "webchat": {
        modelName = "IntegrationWebchat"
        columnName = "inboxId"
        break
      }
      default:
        throw new Error(`Unsupported integration: ${integrationType}`)
    }

    const result = await db.execute<{
      id: string
      auth: AuthValue
      workspaceId: string
      inboxId: string
    }>(
      sql`SELECT * FROM ${sql.identifier(modelName)} WHERE ${sql.identifier(columnName)} = ${integrationIdentifier} LIMIT 1`,
    )

    if (!result.rows[0]) {
      throw new Error(
        `Integration not found: ${integrationType} ${integrationIdentifier}`,
      )
    }

    const workspace = await workspaceService.findById(
      result.rows[0].workspaceId,
    )

    const inbox = await findOrFail({
      table: inboxModel,
      where: { id: result.rows[0].inboxId },
      message: "Inbox not found",
    })

    return {
      integrationRow: result.rows[0],
      workspace,
      inbox,
    }
  },

  getIntegrationFromContactInbox: async (
    contactInbox: ContactInboxModel,
  ): Promise<{
    id: string
    auth: AuthValue
    inboxId: string
    [x: string]: unknown
  }> => {
    const inboxName = contactInbox.channel
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("")

    const integrationTable = `Integration${inboxName}`
    const result = await db.execute<{
      id: string
      auth: AuthValue
      inboxId: string
    }>(
      sql`SELECT * FROM ${sql.identifier(integrationTable)} WHERE "inboxId" = ${contactInbox.inboxId} LIMIT 1`,
    )

    if (!result.rows[0]) {
      throw new SdkException(
        `Unable to find integration auth for channel: ${contactInbox.channel}`,
      )
    }

    return result.rows[0]
  },

  getWorkspaceAndOrganizationFromWorkspaceId: async (
    workspaceId: string,
  ): Promise<{
    workspace: WorkspaceModel
    organization: OrganizationModel
  }> => {
    const workspace = await workspaceService.findById(workspaceId)
    const organization = await organizationService.findById(
      workspace.organizationId,
    )

    return {
      workspace,
      organization,
    }
  },
}

export type ResolvedIntegration = Integration<
  // biome-ignore lint/suspicious/noExplicitAny: matches allIntegrations registry
  IntegrationDefinition<any, any, any>
>

export type ResolvedIntegrationContext = {
  integration: ResolvedIntegration
  ctx: IntegrationContext
}

/**
 * Resolve the {@link IntegrationContext} for an outbound channel call against
 * a {@link ContactInboxModel}: looks up the integration in {@link allIntegrations},
 * loads auth from the per-channel `Integration<Channel>` table, and builds a
 * ctx with `authStore` wired (refresh + persist + lock + offline-marking).
 */
export async function resolveIntegrationContextFromContactInbox(args: {
  workspaceId: string
  contactInbox: ContactInboxModel
}): Promise<ResolvedIntegrationContext> {
  const integration = allIntegrations[args.contactInbox.channel]
  if (!integration) {
    throw new SdkException(
      `No integration registered for channel: ${args.contactInbox.channel}`,
    )
  }

  const integrationRow =
    await integrationService.getIntegrationFromContactInbox(args.contactInbox)

  return {
    integration,
    ctx: await buildContext({
      workspaceId: args.workspaceId,
      integrationType: args.contactInbox.channel,
      integration: integrationRow,
    }),
  }
}
