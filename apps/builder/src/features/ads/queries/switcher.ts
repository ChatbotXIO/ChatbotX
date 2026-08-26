import {
  instagramIntegrationService,
  integrationWhatsappService,
  messengerIntegrationService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { WHATSAPP_OAUTH_CALLBACK_PATH } from "@/features/integration-whatsapp/libs/embedded-signup"
import { resolveProviderOriginForCredential } from "@/lib/provider-origin"

export type AdsSwitcherIntegration = {
  id: string
  name: string
  displayPhoneNumber: string
  inboxId: string
  hasCapiScope: boolean
}

// Redacted to id + name — the channel filter (Phase 6) only needs these to
// populate the messenger/instagram integration select; the full rows carry
// encrypted `auth`, which must never reach a "use client" component's props.
export type AdsSwitcherChannelIntegration = {
  id: string
  name: string
}

export type AdsSwitcherData = {
  integrations: AdsSwitcherIntegration[]
  whatsappCredentialPublic: WhatsappCredentialPublic | null
  oauthCallbackUrl: string
  messengerIntegrations: AdsSwitcherChannelIntegration[]
  // `instagramIntegrationService.findByWorkspaceId` (no `type` filter) returns
  // BOTH IG packages (native login + via Facebook Page) as one list, matching
  // the single `integrationInstagramId` FK that backs both.
  instagramIntegrations: AdsSwitcherChannelIntegration[]
}

export async function getAdsSwitcherData(
  workspaceId: string,
): Promise<AdsSwitcherData> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const [
    whatsappCredential,
    integrations,
    messengerIntegrations,
    instagramIntegrations,
  ] = await Promise.all([
    platformCredentialService.resolveForOwner({
      ownerId: workspace.ownerId,
      type: "whatsapp",
    }),
    integrationWhatsappService.listByWorkspaceId(workspaceId),
    messengerIntegrationService.findByWorkspaceId(workspaceId),
    instagramIntegrationService.findByWorkspaceId(workspaceId),
  ])

  const originUrl = await resolveProviderOriginForCredential(whatsappCredential)

  return {
    integrations: integrations.map((integration) => ({
      id: integration.id,
      name: integration.name,
      displayPhoneNumber: integration.displayPhoneNumber,
      inboxId: integration.inboxId,
      hasCapiScope: integration.hasCapiScope,
    })),
    whatsappCredentialPublic: whatsappCredential?.publicConfig ?? null,
    oauthCallbackUrl: new URL(
      WHATSAPP_OAUTH_CALLBACK_PATH,
      originUrl,
    ).toString(),
    messengerIntegrations: messengerIntegrations.map(({ id, name }) => ({
      id,
      name,
    })),
    instagramIntegrations: instagramIntegrations.map(({ id, name }) => ({
      id,
      name,
    })),
  }
}
