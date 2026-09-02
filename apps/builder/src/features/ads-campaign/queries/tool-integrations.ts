import {
  instagramIntegrationService,
  integrationWhatsappService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import { formatWhatsappIntegrationLabel } from "@/features/integration-whatsapp/libs/integration-label"

/**
 * Redacted to id + name only — never the full integration row (the
 * WhatsApp/Messenger/Instagram rows carry tokens, dataset ids, etc.) since
 * this shape crosses into a "use client" component's props
 * (`MessagingAdsIntegrationFilter`).
 */
export type MessagingAdsToolIntegration = {
  id: string
  name: string
}

export type MessagingAdsToolIntegrationsResult = {
  integrations: MessagingAdsToolIntegration[]
  /**
   * True whenever the workspace has at least one integration on this
   * channel that exists but cannot host the messaging-ads box (today only
   * Instagram: accounts connected via native login, `type !== "facebook"`,
   * the same gate `instagram-capi-tab.tsx` applies to Meta Conversions
   * API). Lets the view show that channel's "unsupported" empty state
   * (`UNSUPPORTED_INTEGRATIONS_EMPTY_STATE` in
   * `messaging-ads-tool-empty-state.tsx`) instead of the generic
   * no-integrations one. `false` for channels without such a distinction.
   */
  hasUnsupportedIntegrations: boolean
}

async function listWhatsappToolIntegrations(
  workspaceId: string,
): Promise<MessagingAdsToolIntegrationsResult> {
  const integrations =
    await integrationWhatsappService.listByWorkspaceId(workspaceId)
  return {
    integrations: integrations.map((integration) => ({
      id: integration.id,
      name: formatWhatsappIntegrationLabel(integration),
    })),
    hasUnsupportedIntegrations: false,
  }
}

async function listMessengerToolIntegrations(
  workspaceId: string,
): Promise<MessagingAdsToolIntegrationsResult> {
  const integrations =
    await messengerIntegrationService.findByWorkspaceId(workspaceId)
  return {
    integrations: integrations.map(({ id, name }) => ({ id, name })),
    hasUnsupportedIntegrations: false,
  }
}

async function listInstagramToolIntegrations(
  workspaceId: string,
): Promise<MessagingAdsToolIntegrationsResult> {
  // No `type` filter here (unlike the CAPI tab's own lookups) — this query
  // needs BOTH packages so it can tell an empty "no Instagram at all"
  // workspace apart from one with only native-login accounts.
  const integrations =
    await instagramIntegrationService.findByWorkspaceId(workspaceId)
  const eligible = integrations.filter(
    (integration) => integration.type === "facebook",
  )
  return {
    integrations: eligible.map(({ id, name }) => ({ id, name })),
    hasUnsupportedIntegrations: eligible.length < integrations.length,
  }
}

const LIST_TOOL_INTEGRATIONS_BY_CHANNEL: Record<
  MessagingAdChannel,
  (workspaceId: string) => Promise<MessagingAdsToolIntegrationsResult>
> = {
  whatsapp: listWhatsappToolIntegrations,
  messenger: listMessengerToolIntegrations,
  instagram: listInstagramToolIntegrations,
}

/**
 * Eligible integrations for one channel's Click to Message Ads tab, plus
 * whether the workspace has Instagram accounts connected via native login
 * (see `hasUnsupportedIntegrations`). Deliberately does NOT reuse
 * `getAdsSwitcherData` (`features/ads/queries/switcher.ts`) — that query
 * resolves the WhatsApp platform credential and OAuth callback origin for
 * the dashboard's connect flow, extra work this read-only tab list doesn't
 * need, and it does not filter Instagram by `type`.
 */
export function listMessagingAdsToolIntegrations(input: {
  workspaceId: string
  channel: MessagingAdChannel
}): Promise<MessagingAdsToolIntegrationsResult> {
  return LIST_TOOL_INTEGRATIONS_BY_CHANNEL[input.channel](input.workspaceId)
}
