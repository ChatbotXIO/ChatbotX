import { SOCIAL_PROVIDERS } from "@chatbotx.io/auth/server"
import { SignUpForm } from "@/features/auth/sign-up"
import { resolveEnabledProvidersForDomain } from "@/lib/auth/auth-instances"
import { getDomainFromHeader } from "@/lib/domain"

export const dynamic = "force-dynamic"

export default async function SignUpPage() {
  const enabledProviders = await resolveEnabledProvidersForDomain(
    await getDomainFromHeader(),
    SOCIAL_PROVIDERS,
  )
  return <SignUpForm enabledProviders={enabledProviders} />
}
