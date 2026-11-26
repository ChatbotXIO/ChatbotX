import type { SocialProvider } from "@chatbotx.io/database/partials"
import type { z } from "zod"
import type {
  publishDestinationGroup,
  publishDestinationResource,
} from "@/features/publish-destinations/schema"

/** One page or profile a post can target, with its state. */
export type PublishDestinationOption = z.infer<
  typeof publishDestinationResource
>
export type PublishDestinationGroup = z.infer<typeof publishDestinationGroup>

/** Only a `ready` destination can be picked; the others are shown with their state. */
export const isDestinationSelectable = (
  destination: Pick<PublishDestinationOption, "state">,
): boolean => destination.state === "ready"

export const flattenDestinations = (
  groups: readonly PublishDestinationGroup[],
): PublishDestinationOption[] => groups.flatMap((group) => group.destinations)

/** The networks that have at least one destination, in the order the server lists them. */
export const providersWithDestinations = (
  groups: readonly PublishDestinationGroup[],
): SocialProvider[] =>
  groups
    .filter((group) => group.destinations.length > 0)
    .map((group) => group.provider)

/** The destinations a post can be published to right now. */
export const selectableDestinations = (
  groups: readonly PublishDestinationGroup[],
): PublishDestinationOption[] =>
  flattenDestinations(groups).filter(isDestinationSelectable)
