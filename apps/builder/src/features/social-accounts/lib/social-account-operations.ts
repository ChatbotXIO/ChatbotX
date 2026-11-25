import {
  platformCredentialService,
  resolveCredentialOwnerIdForWorkspace,
  socialAccountService,
} from "@chatbotx.io/business"
import { socialAccountOperationService } from "@chatbotx.io/business/social-account/operations"
import {
  type SocialAccountProvider,
  socialAccountProviders,
} from "@chatbotx.io/channel-registry/social-account"
import {
  SOCIAL_PROVIDER_CAPABILITIES,
  type SocialProvider,
} from "@chatbotx.io/utils/social-account"

export type { PublishingSettings } from "@chatbotx.io/business/social-account/operations"

type AccountRef = { id: string; workspaceId: string }

/** The operations the public API and the Posts page's session procedures share: thin calls to the business service. */
export const socialAccountOperations = {
  list: (workspaceId: string) => socialAccountService.list(workspaceId),

  get: (input: AccountRef) => socialAccountService.get(input),

  verify: (input: AccountRef) =>
    socialAccountOperationService.verify(input, socialAccountProviders),

  syncDestinations: (input: AccountRef) =>
    socialAccountOperationService.syncDestinations(
      input,
      socialAccountProviders,
    ),

  disconnect: (input: AccountRef) =>
    socialAccountOperationService.disconnect(input, socialAccountProviders),

  publishingSettings: (input: { destinationId: string; workspaceId: string }) =>
    socialAccountOperationService.publishingSettings(input),
}

/** The providers whose publishing app the owner configured: the Accounts page enables Connect only for these. */
export const connectableSocialProviders = async (
  workspaceId: string,
): Promise<SocialProvider[]> => {
  const ownerId = await resolveCredentialOwnerIdForWorkspace(workspaceId)
  const entries = await Promise.all(
    (Object.keys(socialAccountProviders) as SocialAccountProvider[]).map(
      async (provider) => ({
        configured:
          SOCIAL_PROVIDER_CAPABILITIES[provider].connectSupported &&
          Boolean(
            await platformCredentialService.resolveForOwner({
              ownerId,
              type: socialAccountProviders[provider].credentialType,
            }),
          ),
        provider,
      }),
    ),
  )
  return entries.filter((entry) => entry.configured).map((e) => e.provider)
}
