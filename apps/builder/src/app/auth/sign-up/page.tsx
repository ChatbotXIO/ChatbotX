import { SignUpForm } from "@/features/auth/sign-up"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  return <SignUpForm brandName="ChatbotX" />
}
