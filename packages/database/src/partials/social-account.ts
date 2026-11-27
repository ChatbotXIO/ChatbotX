// The vocabulary is shared with the channel adapters, which cannot depend on
// this package, so it lives in `@chatbotx.io/utils`.
export {
  type SocialAccountStatus,
  type SocialAccountStatusReason,
  type SocialDestinationKind,
  type SocialProvider,
  socialAccountStatuses,
  socialAccountStatusReasons,
  socialDestinationKinds,
  socialProviders,
} from "@chatbotx.io/utils/social-account"

/** The AAD that binds an account's tokens to its row; a copied blob decrypts nowhere else. */
export const socialAccountAad = (workspaceId: string, id: string): string =>
  `social-account:${workspaceId}:${id}`

/** The AAD of a destination's own token. */
export const socialDestinationAad = (workspaceId: string, id: string): string =>
  `social-account-destination:${workspaceId}:${id}`
