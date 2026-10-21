import { SignUpForm } from "@/features/auth/sign-up"
import { resolveAuthPageOptions } from "@/lib/auth/auth-page-options"

export const dynamic = "force-dynamic"

export default async function SignUpPage() {
  const options = await resolveAuthPageOptions()

  return <SignUpForm {...options} />
}
