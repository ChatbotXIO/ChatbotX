import {
  instagramIntegrationService,
  integrationWhatsappService,
  type MetaConversionsChannel,
  type MetaConversionsIntegrationByChannel,
  messengerIntegrationService,
} from "@chatbotx.io/business"

type WorkspaceIntegrationRef = { id: string; workspaceId: string }

type IntegrationLookup<TChannel extends MetaConversionsChannel> = (
  ref: WorkspaceIntegrationRef,
) => Promise<MetaConversionsIntegrationByChannel[TChannel] | null>

const lookupByChannel: {
  [TChannel in MetaConversionsChannel]: IntegrationLookup<TChannel>
} = {
  // Messenger/Instagram lookups resolve `undefined` for a miss; normalise to
  // `null` so every channel shares one return shape.
  messenger: async (ref) =>
    (await messengerIntegrationService.findByIdForWorkspace(ref)) ?? null,
  instagram: async (ref) =>
    (await instagramIntegrationService.findByIdForWorkspace(ref)) ?? null,
  whatsapp: (ref) => integrationWhatsappService.findByIdForWorkspace(ref),
}

/**
 * Loads the CAPI-capable integration row for a channel, workspace-scoped.
 * Lets one server action serve all three channels instead of three copies;
 * the cast only re-states what the mapped-type map above already guarantees
 * per key (TypeScript cannot narrow an indexed access on a generic key).
 */
export const findCapiIntegration = <TChannel extends MetaConversionsChannel>(
  channel: TChannel,
  ref: WorkspaceIntegrationRef,
): Promise<MetaConversionsIntegrationByChannel[TChannel] | null> =>
  (lookupByChannel[channel] as IntegrationLookup<TChannel>)(ref)

export const integrationNotFoundErrorKey = {
  messenger: "messengerNotFound",
  instagram: "instagramNotFound",
  whatsapp: "whatsappNotFound",
} as const satisfies Record<MetaConversionsChannel, string>
