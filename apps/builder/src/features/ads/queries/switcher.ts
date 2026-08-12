import {
  integrationWhatsappService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"

export type AdsSwitcherIntegration = {
  id: string
  name: string
  displayPhoneNumber: string
  inboxId: string
  hasCapiScope: boolean
}

export type AdsSwitcherData = {
  integrations: AdsSwitcherIntegration[]
  whatsappCredentialPublic: WhatsappCredentialPublic | null
}

export async function getAdsSwitcherData(
  workspaceId: string,
): Promise<AdsSwitcherData> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const [whatsappCredential, integrations] = await Promise.all([
    platformCredentialService.resolveForOwner({
      ownerId: workspace.ownerId,
      type: "whatsapp",
    }),
    integrationWhatsappService.listByWorkspaceId(workspaceId),
  ])

  return {
    integrations: integrations.map((integration) => ({
      id: integration.id,
      name: integration.name,
      displayPhoneNumber: integration.displayPhoneNumber,
      inboxId: integration.inboxId,
      hasCapiScope: integration.hasCapiScope,
    })),
    whatsappCredentialPublic: whatsappCredential?.publicConfig ?? null,
  }
}
