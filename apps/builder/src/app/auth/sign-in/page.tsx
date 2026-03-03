import { SignInForm } from "@/features/auth/sign-in"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  return <SignInForm brandName="ChatbotX" />
}
