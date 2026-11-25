import {
  type SocialAccountStatus,
  type SocialAccountStatusReason,
  type SocialDestinationKind,
  type SocialProvider,
  socialAccountStatusReasons,
} from "@chatbotx.io/database/partials"
import type {
  SocialAccountSafeRow,
  SocialDestinationSafeRow,
} from "@chatbotx.io/database/repositories"
import { enabledContentTypes } from "@chatbotx.io/utils/post-publishing"
import {
  missingSocialScopes,
  type SocialContentType,
} from "@chatbotx.io/utils/social-account"

export type SocialDestinationDto = {
  avatar: string | null
  externalId: string
  id: string
  isActive: boolean
  kind: SocialDestinationKind
  lastSyncedAt: Date | null
  name: string
  username: string | null
}

/**
 * What any caller may see of a connected account. There is deliberately no
 * token field: tokens are encrypted at rest and only ever decrypted inside a
 * provider call, never returned, logged or cached.
 */
export type SocialAccountDto = {
  avatar: string | null
  connectedAt: Date
  connectedById: string | null
  contentTypes: SocialContentType[]
  destinations: SocialDestinationDto[]
  displayName: string
  externalAccountId: string
  grantedScopes: string[]
  id: string
  lastVerifiedAt: Date | null
  /** Permissions the connect dialog requires that the platform did not grant. */
  missingScopes: string[]
  provider: SocialProvider
  status: SocialAccountStatus
  statusReason: SocialAccountStatusReason | null
  tokenExpiresAt: Date | null
  username: string | null
}

export const toSocialDestinationDto = (
  row: SocialDestinationSafeRow,
): SocialDestinationDto => ({
  avatar: row.avatar,
  externalId: row.externalId,
  id: row.id,
  isActive: row.isActive,
  kind: row.kind,
  lastSyncedAt: row.lastSyncedAt,
  name: row.name,
  username: row.username,
})

export const toSocialAccountDto = (
  row: SocialAccountSafeRow,
  destinations: SocialDestinationSafeRow[],
): SocialAccountDto => ({
  avatar: row.avatar,
  connectedAt: row.createdAt,
  connectedById: row.connectedById,
  contentTypes: enabledContentTypes(row.provider),
  destinations: destinations.map(toSocialDestinationDto),
  displayName: row.displayName,
  externalAccountId: row.externalAccountId,
  grantedScopes: row.grantedScopes,
  id: row.id,
  lastVerifiedAt: row.lastVerifiedAt,
  missingScopes: missingSocialScopes(row.provider, row.grantedScopes),
  provider: row.provider,
  status: row.status,
  // A value outside the finite set (a row from an older release) reads as none.
  statusReason:
    socialAccountStatusReasons.safeParse(row.statusReason).data ?? null,
  tokenExpiresAt: row.tokenExpiresAt,
  username: row.username,
})
