import Image from "next/image"
import { SignInForm } from "@/features/auth/signin-form"

export default function SignInPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="flex items-center gap-2 self-center font-medium text-3xl">
          <div className="flex items-center justify-center text-primary-foreground">
            <Image
              alt="AhaChat AI"
              height={48}
              priority={true}
              src="/brand/logo.svg"
              width={48}
            />
          </div>
          AhaChat AI
        </h1>

        <SignInForm />
      </div>
    </div>
  )
}
