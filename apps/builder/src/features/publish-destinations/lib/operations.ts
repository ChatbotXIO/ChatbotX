import type { PublishDestinationDto } from "@chatbotx.io/business"
import {
  publishDestinationService,
  publishScopeRecheckService,
} from "@chatbotx.io/business"
import { enabledContentTypes } from "@chatbotx.io/utils/post-publishing"
import type { PublishDestinationState } from "@chatbotx.io/utils/publish-destination"
import {
  type SocialProvider,
  socialProviders,
} from "@chatbotx.io/utils/social-account"
import type { z } from "zod"
import type {
  listPublishDestinationsResponse,
  publishDestinationResource,
} from "../schema"

type PublishDestinationResource = z.output<typeof publishDestinationResource>
type PublishDestinationGroups = z.output<typeof listPublishDestinationsResponse>

/** The state that lists the disconnected inboxes too (they are hidden otherwise). */
const DISCONNECTED_STATE: PublishDestinationState = "inboxDisconnected"

const toResource = (
  destination: PublishDestinationDto,
): PublishDestinationResource => ({
  avatar: destination.avatar,
  contentTypes: enabledContentTypes(destination.provider),
  externalId: destination.externalId,
  id: destination.id,
  inboxId: destination.inboxId,
  integrationId: destination.integrationId,
  missingScopes: destination.missingScopes,
  name: destination.name,
  pausedUntil: destination.pausedUntil,
  pauseReason: destination.pauseReason,
  profileUrl: destination.profileUrl,
  provider: destination.provider,
  socialAccountId: destination.socialAccountId,
  state: destination.state,
  viaFacebook: destination.viaFacebook,
})

/** The publish-destination reads the public API and the Posts page's session procedures share. */
export const publishDestinationOperations = {
  /**
   * Destinations per network, in a fixed order. Reading creates the missing
   * bindings of connected inboxes (idempotent, bounded per network).
   */
  list: async (input: {
    providers?: readonly SocialProvider[]
    states?: readonly PublishDestinationState[]
    workspaceId: string
  }): Promise<PublishDestinationGroups> => {
    const providers = socialProviders.options.filter(
      (provider) => !input.providers || input.providers.includes(provider),
    )
    const connectedOnly = !input.states?.includes(DISCONNECTED_STATE)
    const items: PublishDestinationGroups["items"] = []
    for (const provider of providers) {
      const list = await publishDestinationService.list({
        connectedOnly,
        providers: [provider],
        states: input.states,
        workspaceId: input.workspaceId,
      })
      items.push({
        destinations: list.destinations.map(toResource),
        provider,
        truncated: list.truncated,
      })
    }
    return { items }
  },

  /**
   * Asks for the granted permissions of the destinations to be re-read from the
   * platform in the background (best effort, deduplicated per destination).
   */
  recheckPermissions: async (input: {
    ids?: readonly string[]
    workspaceId: string
  }) =>
    await publishScopeRecheckService.requestScopeRecheck({
      destinationIds: input.ids,
      workspaceId: input.workspaceId,
    }),

  get: async (input: {
    id: string
    workspaceId: string
  }): Promise<PublishDestinationResource> =>
    toResource(await publishDestinationService.get(input)),
}
