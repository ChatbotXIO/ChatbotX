import {
  socialAccountStatuses,
  socialAccountStatusReasons,
  socialDestinationKinds,
  socialProviders,
} from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { socialContentTypes } from "@chatbotx.io/utils/social-account"
import { z } from "zod"

export const socialAccountId = zodBigintIdAsString()

const socialDestinationResource = z.object({
  avatar: z.string().nullable(),
  externalId: z.string().describe("The platform's id of the Page or profile."),
  id: z.string().describe("Destination id; pass it as a publish target."),
  isActive: z
    .boolean()
    .describe(
      "`false` for a Page the connected person cannot publish to, or one the platform no longer lists.",
    ),
  kind: socialDestinationKinds,
  lastSyncedAt: z.date().nullable(),
  name: z.string(),
  username: z.string().nullable(),
})

/** A connected account. It carries no token: tokens are encrypted at rest and never returned. */
export const socialAccountResource = z.object({
  avatar: z.string().nullable(),
  connectedAt: z.date(),
  connectedById: z.string().nullable(),
  contentTypes: z
    .array(socialContentTypes)
    .describe("What the network accepts through its publishing API."),
  destinations: z.array(socialDestinationResource),
  displayName: z.string(),
  externalAccountId: z.string(),
  grantedScopes: z.array(z.string()),
  id: z.string().describe("Account id."),
  lastVerifiedAt: z.date().nullable(),
  missingScopes: z
    .array(z.string())
    .describe(
      "Permissions publishing needs that the platform did not grant. Reconnect the account to grant them.",
    ),
  provider: socialProviders,
  status: socialAccountStatuses.describe(
    "`connected` publishes; `needsReauth` lost its token or a permission and needs a reconnect from the Posts page; `disconnected` was removed.",
  ),
  statusReason: socialAccountStatusReasons
    .nullable()
    .describe(
      "Why the account is not `connected`: `tokenRejected`, `tokenExpired`, `refreshRejected` or `permissionNotGranted` (which permissions: see `missingScopes`).",
    ),
  tokenExpiresAt: z.date().nullable(),
  username: z.string().nullable(),
})

export const socialAccountIdRequest = z.object({
  id: socialAccountId.describe(
    "Account id. Get it from `socialAccounts.list`.",
  ),
})

export const listSocialAccountsResponse = z.object({
  items: z.array(socialAccountResource),
})

export const socialDestinationPublishingSettingsResource = z.object({
  canPostNow: z
    .boolean()
    .describe(
      "`false` when the creator cannot post at the moment (daily cap, app user cap, ban); stop and try later. See `cannotPostReason`.",
    ),
  cannotPostReason: z
    .string()
    .nullable()
    .describe("TikTok's error code when `canPostNow` is `false`."),
  commentDisabled: z
    .boolean()
    .describe("The creator turned comments off: `allowComment` cannot be on."),
  creatorAvatarUrl: z.string().nullable(),
  creatorNickname: z
    .string()
    .nullable()
    .describe("Show it where the post is composed: the account it goes to."),
  creatorUsername: z.string().nullable(),
  duetDisabled: z
    .boolean()
    .describe("`allowDuet` cannot be on (private account or creator setting)."),
  maxVideoPostDurationSec: z
    .number()
    .int()
    .nullable()
    .describe("The longest video, in seconds, this creator can post."),
  privacyLevelOptions: z
    .array(z.string())
    .describe(
      "The only values `options.privacyLevel` may take for this creator. TikTok allows no default: the caller must choose one.",
    ),
  provider: socialProviders,
  stitchDisabled: z
    .boolean()
    .describe(
      "`allowStitch` cannot be on (private account or creator setting).",
    ),
})
