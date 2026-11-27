import type { SocialProvider } from "@chatbotx.io/database/partials"
import type { PublishDestinationState } from "@chatbotx.io/utils/publish-destination"
import { useQuery } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

type PublishDestinationFilters = {
  providers?: SocialProvider[]
  states?: PublishDestinationState[]
}

/**
 * The destinations a post can target (connected Facebook, Instagram and
 * Threads inboxes plus TikTok accounts), grouped by network, each with its
 * state. Pickers show every destination and select only the `ready` ones.
 * Invalidate `orpc.publishDestinationsAPIs.key()` after a reconnect.
 */
export const usePublishDestinations = (
  workspaceId: string,
  filters: PublishDestinationFilters = {},
) =>
  useQuery(
    orpc.publishDestinationsAPIs.privateListPublishDestinationsAPI.queryOptions(
      { input: { ...filters, workspaceId } },
    ),
  )
