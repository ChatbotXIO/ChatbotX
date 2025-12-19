import { SignInForm } from "@/features/auth/signin-form"

export const dynamic = "force-dynamic"

export default async function SignInPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <SignInForm brandName="ChatbotX" />
      </div>
    </div>
  )
}
