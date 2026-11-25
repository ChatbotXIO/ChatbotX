import { socialProviders } from "@chatbotx.io/database/partials"
import {
  PUBLISH_SCOPE_RECHECK_MAX,
  publishDestinationStates,
} from "@chatbotx.io/utils/publish-destination"
import { publishPauseReasons } from "@chatbotx.io/utils/publish-limits"
import { socialContentTypes } from "@chatbotx.io/utils/social-account"
import { z } from "zod"
import { destinationScheduleRequest } from "@/features/social-posts/schema"

const MAX_FILTER_VALUES = 10

/** A lone `?x=a` stays a string in query parsing; wrap it so it reads as a list. */
const queryArray = <Item extends z.ZodType>(item: Item) =>
  z.preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(item).max(MAX_FILTER_VALUES),
  )

const stateDescription =
  "`ready` can publish; `inboxDisconnected`: the inbox is disconnected; `needsReconnect`: the connection expired, reconnect the channel from the Posts page (one Facebook reconnect refreshes every Page of that login); `permissionMissing`: a publishing permission is not granted, reconnect to allow publishing."

export const publishDestinationResource = z.object({
  avatar: z.string().nullable(),
  contentTypes: z
    .array(socialContentTypes)
    .describe("What the network accepts through its publishing API."),
  externalId: z
    .string()
    .nullable()
    .describe("The platform's id of the Page or profile."),
  id: z.string().describe("Destination id; pass it as a publish target."),
  inboxId: z
    .string()
    .nullable()
    .describe(
      "The inbox that publishes (Facebook, Instagram, Threads); `null` for TikTok.",
    ),
  integrationId: z
    .string()
    .nullable()
    .describe(
      "The channel integration behind the inbox (reconnect target); `null` for TikTok.",
    ),
  missingScopes: z
    .array(z.string())
    .describe(
      "Permissions publishing needs that the network did not grant. Reconnect the channel to grant them.",
    ),
  name: z.string().nullable(),
  pausedUntil: z
    .date()
    .nullable()
    .describe(
      "Publishing is paused until this time because the network limited the account. Posts due earlier wait and publish after it. `null` when not paused.",
    ),
  pauseReason: publishPauseReasons
    .nullable()
    .describe(
      "Why it is paused: `limitReached` (the network's rate or daily limit answered repeatedly), `accountRestricted` (the network restricted the account), `spamRisk` (a spam-risk answer). `null` when not paused.",
    ),
  profileUrl: z
    .string()
    .nullable()
    .describe(
      "The page or profile's public URL on its network (https); `null` when it cannot be built.",
    ),
  provider: socialProviders,
  socialAccountId: z
    .string()
    .nullable()
    .describe(
      "The TikTok publishing login (`socialAccounts.get`); `null` for the inbox networks.",
    ),
  state: publishDestinationStates.describe(stateDescription),
  viaFacebook: z
    .boolean()
    .describe(
      "Instagram only: the inbox was connected through a Facebook Page, not Instagram Login.",
    ),
})

export const listPublishDestinationsRequest = z.strictObject({
  providers: queryArray(socialProviders)
    .optional()
    .describe("Only these networks. Omit for every network."),
  states: queryArray(publishDestinationStates)
    .optional()
    .describe(
      "Only destinations in these states. Omit to list every destination of a connected inbox; ask for `inboxDisconnected` to see the disconnected ones.",
    ),
})

export const publishDestinationGroup = z.object({
  destinations: z.array(publishDestinationResource),
  provider: socialProviders,
  truncated: z
    .boolean()
    .describe(
      "True when the workspace has more inboxes on this network than `destinations` lists (the list is capped).",
    ),
})

export const listPublishDestinationsResponse = z.object({
  items: z
    .array(publishDestinationGroup)
    .describe("One group per requested network, in a fixed order."),
})

export const publishDestinationIdRequest = destinationScheduleRequest

export const recheckPublishPermissionsRequest = z.strictObject({
  ids: z
    .array(z.string().min(1))
    .max(PUBLISH_SCOPE_RECHECK_MAX)
    .optional()
    .describe(
      "Destination ids to re-check (at most 100). Omit to re-check every connected Facebook Page and Instagram (Facebook Login) destination of the workspace. Get ids from `publishDestinations.list`.",
    ),
})

export const recheckPublishPermissionsResponse = z.object({
  failed: z
    .number()
    .int()
    .describe(
      "Destinations whose re-read could not be queued (the queue or its claim store was unavailable). Nothing was read for them; ask again later.",
    ),
  fresh: z
    .number()
    .int()
    .describe(
      "Destinations checked less than 10 minutes ago or already being re-checked by another request.",
    ),
  queued: z
    .number()
    .int()
    .describe(
      "Destinations handed to a background re-read of their permissions. Read the result with `publishDestinations.list` a few seconds later.",
    ),
  skipped: z
    .number()
    .int()
    .describe(
      "Destinations that cannot be re-checked now: unknown, on a disconnected or expired channel, on a network that documents no way to read granted permissions (Instagram Login, Threads, TikTok), or beyond the 100 one request covers.",
    ),
})
