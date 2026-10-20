import { isSignUpDisabled, SOCIAL_PROVIDERS } from "@chatbotx.io/auth/server"
import { SignInForm } from "@/features/auth/sign-in"
import { resolveInvitationFromCookie } from "@/features/invitations/lib/invitation-cookie"
import { resolveEnabledProvidersForDomain } from "@/lib/auth/auth-instances"
import { resolveGenericOAuthButton } from "@/lib/auth/generic-oauth"
import { getDomainFromHeader } from "@/lib/domain"
export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const [enabledProviders, genericOAuth, invitation] = await Promise.all([
    resolveEnabledProvidersForDomain(
      await getDomainFromHeader(),
      SOCIAL_PROVIDERS,
    ),
    resolveGenericOAuthButton(),
    resolveInvitationFromCookie(),
  ])
  const signUpAllowed = !isSignUpDisabled() || Boolean(invitation)
  return (
    <SignInForm
      enabledProviders={enabledProviders}
      genericOAuth={genericOAuth}
      signUpEnabled={signUpAllowed}
    />
  )
}
