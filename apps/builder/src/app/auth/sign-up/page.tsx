import { isSignUpDisabled, SOCIAL_PROVIDERS } from "@chatbotx.io/auth/server"
import { SignUpForm } from "@/features/auth/sign-up"
import { resolveInvitationFromCookie } from "@/features/invitations/lib/invitation-cookie"
import { resolveEnabledProvidersForDomain } from "@/lib/auth/auth-instances"
import { resolveGenericOAuthButton } from "@/lib/auth/generic-oauth"
import { getDomainFromHeader } from "@/lib/domain"
export const dynamic = "force-dynamic"

export default async function SignUpPage() {
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
    <SignUpForm
      enabledProviders={enabledProviders}
      genericOAuth={genericOAuth}
      signUpAllowed={signUpAllowed}
    />
  )
}
