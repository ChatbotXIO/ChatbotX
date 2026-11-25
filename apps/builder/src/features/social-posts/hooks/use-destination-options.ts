import { publishDestinationStates } from "@chatbotx.io/utils/publish-destination"
import type { DestinationOption } from "../components/calendar/calendar-toolbar"
import { PROVIDER_LABELS } from "../lib/composer-state"
import { flattenDestinations } from "../lib/publish-destination-options"
import { usePublishDestinations } from "./use-publish-destinations"

/** Every page and profile a post can sit on, for the destination filter (since-disconnected ones stay filterable). */
export const useDestinationOptions = (
  workspaceId: string,
): DestinationOption[] => {
  const list = usePublishDestinations(workspaceId, {
    states: publishDestinationStates.options,
  })
  return flattenDestinations(list.data?.items ?? []).map((destination) => ({
    id: destination.id,
    label: destination.name ?? PROVIDER_LABELS[destination.provider],
    provider: destination.provider,
  }))
}
