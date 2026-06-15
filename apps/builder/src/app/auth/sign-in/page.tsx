import { SignInForm } from "@/features/auth/sign-in"
import { isGoogleLoginEnabledForDomain } from "@/lib/auth/auth-instances"
import { getDomainFromHeader } from "@/lib/domain"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const googleEnabled = await isGoogleLoginEnabledForDomain(
    await getDomainFromHeader(),
  )
  return <SignInForm googleEnabled={googleEnabled} />
}
