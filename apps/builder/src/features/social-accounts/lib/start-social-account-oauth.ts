import { platformCredentialService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type SocialAccountProvider,
  socialAccountProviders,
} from "@chatbotx.io/channel-registry/social-account"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { SOCIAL_PROVIDER_CAPABILITIES } from "@chatbotx.io/utils/social-account"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { issueOAuthNonce } from "@/lib/oauth-state-nonce"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"
import { connectTabPath } from "./connect-route"

/** The OAuth `state` flow marker the callback dispatches on. */
export const SOCIAL_ACCOUNT_OAUTH_FLOW = "socialAccount"

/**
 * Sends a workspace admin to the network's login dialog to connect a TikTok account
 * for publishing (the only network with a separate publishing login). The
 * dialog asks only for profile read and publishing permissions; the callback (`callback-social-account.ts`) stores the result and
 * creates no inbox, integration or messaging webhook.
 *
 * Session members only, and only a super admin: an API token cannot reach this.
 * The `state` carries a single-use nonce that is also set as an httpOnly cookie,
 * so only the browser that pressed Connect can finish the round trip.
 */
export async function startSocialAccountOAuth(input: {
  provider: SocialAccountProvider
  workspace: WorkspaceModel
}): Promise<never> {
  const { provider, workspace } = input
  const t = await getTranslations("socialAccounts.errors")

  await assertWorkspaceSuperAdmin(workspace.id)

  if (!SOCIAL_PROVIDER_CAPABILITIES[provider].connectSupported) {
    throw new ChatbotXException(t("providerNotSupported"))
  }
  const adapter = socialAccountProviders[provider]

  const credential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
    type: adapter.credentialType,
  })
  if (!credential) {
    throw new ChatbotXException(t("appNotConfigured"))
  }

  const redirectUrl = await buildProviderCallbackUrl(
    credential,
    adapter.callbackPath,
  )
  const referer = new URL(
    connectTabPath(workspace.id),
    await getOriginUrlFromHeader(),
  ).toString()

  return redirect(
    adapter.generateAuthUrl({
      clientId: credential.config.clientId,
      redirectUrl,
      stateParams: {
        flow: SOCIAL_ACCOUNT_OAUTH_FLOW,
        nonce: await issueOAuthNonce(),
        referer,
        socialProvider: provider,
        workspaceId: workspace.id,
      },
    }),
  )
}
