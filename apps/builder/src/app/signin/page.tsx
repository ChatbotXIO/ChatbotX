import { SignInForm } from "@/features/auth/signin-form"
import { auth } from "@/lib/auth/auth"

export default async function SignInPage() {
  await auth.api.signUpEmail({
    body: {
      name: "Demo", // required
      email: "demo2@example.com", // required
      password: "Demo@1234", // required
    },
  })
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <SignInForm brandName="ChatbotX" />
      </div>
    </div>
  )
}
