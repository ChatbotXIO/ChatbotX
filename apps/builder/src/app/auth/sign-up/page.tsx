import { SignUpForm } from "@/features/auth/sign-up"
import { isGoogleLoginEnabledForDomain } from "@/lib/auth/auth-instances"
import { getDomainFromHeader } from "@/lib/domain"

export const dynamic = "force-dynamic"

export default async function SignUpPage() {
  const googleEnabled = await isGoogleLoginEnabledForDomain(
    await getDomainFromHeader(),
  )
  return <SignUpForm googleEnabled={googleEnabled} />
}
