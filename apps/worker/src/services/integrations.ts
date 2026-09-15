import {
  buildContext,
  type IntegrationContext,
  workspaceService,
} from "@chatbotx.io/business"
import { CONNECTION_REGISTRY } from "@chatbotx.io/connections"
import { findOrFail } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { integrationLookupRepository } from "@chatbotx.io/database/repositories"
import { inboxModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  InboxModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import {
  type AuthValue,
  ChannelError,
  ChannelErrorCategory,
  type Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { IntegrationNotFoundError } from "./orphaned-integration-cleanup"

/**
 * Sourced from `CONNECTION_REGISTRY` (the single exhaustive provider
 * registry `@chatbotx.io/connections` builds) instead of importing each
 * `integrations/<name>` package directly. `gemini`/`openai` stay `undefined`
 * — same as before this derivation — because those two `IntegrationType`s
 * have no `integrations/` SDK package (`CONNECTION_REGISTRY.gemini`/`.openai`
 * are credential-only adapters with no `.integration` field to read).
 */
export const allIntegrations: Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: safe pass value
  Integration<IntegrationDefinition<any, any, any>> | undefined
> = {
  api: CONNECTION_REGISTRY.api?.integration,
  gemini: CONNECTION_REGISTRY.gemini?.integration,
  googleCalendar: CONNECTION_REGISTRY.googleCalendar?.integration,
  googleSheets: CONNECTION_REGISTRY.googleSheets?.integration,
  messenger: CONNECTION_REGISTRY.messenger?.integration,
  openai: CONNECTION_REGISTRY.openai?.integration,
  webchat: CONNECTION_REGISTRY.webchat?.integration,
  whatsapp: CONNECTION_REGISTRY.whatsapp?.integration,
  telegram: CONNECTION_REGISTRY.telegram?.integration,
  tiktok: CONNECTION_REGISTRY.tiktok?.integration,
  zalo: CONNECTION_REGISTRY.zalo?.integration,
  chatbotx: CONNECTION_REGISTRY.chatbotx?.integration,
  smtp: CONNECTION_REGISTRY.smtp?.integration,
  instagram: CONNECTION_REGISTRY.instagram?.integration,
  instagramFacebook: CONNECTION_REGISTRY.instagramFacebook?.integration,
}

export type IntegrationRow = {
  id: string
  auth: AuthValue
  inboxId: string
  type?: string
  [x: string]: unknown
}

export function isInstagramViaFacebook(row: IntegrationRow): boolean {
  return row.type === "facebook"
}

export const integrationService = {
  identifyInboxAndIntegrationAuthFromIdentifier: async (
    integrationType: IntegrationType,
    integrationIdentifier: string,
  ): Promise<{
    workspace: WorkspaceModel
    inbox: InboxModel
    integrationRow: IntegrationRow
  }> => {
    let modelName: string | null = null
    let columnName: string | null = null

    // SMTP is outbound-only and has no inbound identifier resolution path.
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
        columnName = "igId"
        break
      }
      case "instagramFacebook": {
        modelName = "IntegrationInstagram"
        columnName = "igId"
        break
      }
      case "tiktok": {
        modelName = "IntegrationTiktok"
        columnName = "openId"
        break
      }
      case "webchat": {
        modelName = "IntegrationWebchat"
        columnName = "inboxId"
        break
      }
      case "api": {
        modelName = "IntegrationApi"
        columnName = "inboxId"
        break
      }
      default:
        throw new Error(`Unsupported integration: ${integrationType}`)
    }

    const row = await integrationLookupRepository.findAuthByIdentifier({
      modelName,
      columnName,
      identifier: integrationIdentifier,
    })

    if (!row) {
      throw new IntegrationNotFoundError(integrationType, integrationIdentifier)
    }

    const integrationRow = row as IntegrationRow & { workspaceId: string }

    const workspace = await workspaceService.findById({
      id: integrationRow.workspaceId,
    })

    const inbox = await findOrFail({
      table: inboxModel,
      where: { id: integrationRow.inboxId },
      message: "Inbox not found",
    })

    return {
      integrationRow,
      workspace,
      inbox,
    }
  },

  getIntegrationFromContactInbox: async (
    contactInbox: ContactInboxModel,
  ): Promise<IntegrationRow> => {
    let integrationTable: string
    switch (contactInbox.channel) {
      case "messenger":
        integrationTable = "IntegrationMessenger"
        break
      case "telegram":
        integrationTable = "IntegrationTelegram"
        break
      case "whatsapp":
        integrationTable = "IntegrationWhatsapp"
        break
      case "zalo":
        integrationTable = "IntegrationZalo"
        break
      case "tiktok":
        integrationTable = "IntegrationTiktok"
        break
      case "webchat":
        integrationTable = "IntegrationWebchat"
        break
      case "smtp":
        integrationTable = "IntegrationSmtp"
        break
      case "instagram":
        integrationTable = "IntegrationInstagram"
        break
      case "api":
        integrationTable = "IntegrationApi"
        break
      default:
        throw new ChannelError(
          `Unsupported integration channel: ${contactInbox.channel}`,
          ChannelErrorCategory.AUTH_FAILED,
          { code: "unsupported_channel" },
        )
    }

    const row = await integrationLookupRepository.findAuthByInboxId({
      modelName: integrationTable,
      inboxId: contactInbox.inboxId,
    })

    if (!row) {
      throw new ChannelError(
        `Unable to find integration auth for channel: ${contactInbox.channel}`,
        ChannelErrorCategory.AUTH_FAILED,
        { code: "integration_auth_missing" },
      )
    }

    return row as IntegrationRow
  },
}

export type ResolvedIntegration = Integration<
  // biome-ignore lint/suspicious/noExplicitAny: matches allIntegrations registry
  IntegrationDefinition<any, any, any>
>

export type ResolvedIntegrationContext = {
  integration: ResolvedIntegration
  ctx: IntegrationContext
  integrationRow: Awaited<
    ReturnType<typeof integrationService.getIntegrationFromContactInbox>
  >
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
  let integration = allIntegrations[args.contactInbox.channel]
  if (!integration) {
    throw new SdkException(
      `No integration registered for channel: ${args.contactInbox.channel}`,
    )
  }

  const integrationRow =
    await integrationService.getIntegrationFromContactInbox(args.contactInbox)

  if (
    args.contactInbox.channel === "instagram" &&
    isInstagramViaFacebook(integrationRow)
  ) {
    integration = allIntegrations.instagramFacebook ?? integration
  }

  return {
    integration,
    integrationRow,
    ctx: await buildContext({
      workspaceId: args.workspaceId,
      integrationType: args.contactInbox.channel,
      integration: integrationRow,
    }),
  }
}
