import { SignInForm } from "@/features/auth/sign-in"
import { resolveAuthPageOptions } from "@/lib/auth/auth-page-options"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  const options = await resolveAuthPageOptions()

  return <SignInForm {...options} />
}
