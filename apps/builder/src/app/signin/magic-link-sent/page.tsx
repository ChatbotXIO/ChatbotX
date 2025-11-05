import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { CheckCircleIcon, MailIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default function MagicLinkSentPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
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

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircleIcon className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-xl">Check your email</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="mb-6 flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <MailIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">
                  We've sent you a magic link to sign in to your account.
                </p>
                <p className="text-muted-foreground text-sm">
                  Click the link in your email to continue.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Button asChild className="w-full" variant="outline">
                <Link href="/signin">Back to sign in</Link>
              </Button>

              <div className="text-muted-foreground text-xs">
                <p>Didn't receive the email? Check your spam folder.</p>
                <p>You can also try signing in again with a different email.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
