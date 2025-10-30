"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import GoogleButton from "react-google-button"
import { authClient } from "@/lib/auth-client"
import { EmailPasswordSignIn } from "./components/email-password-signin"
import { MagicLinkSignIn } from "./components/magic-link-signin"

export const SignInForm = ({
  callbackUrl,
  ...props
}: {
  callbackUrl?: string
}) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2">
            <Image
              alt="AhaChat AI"
              height={64}
              priority={true}
              src="/brand/logo.svg"
              width={64}
            />
          </div>
          <CardTitle className="text-slate-600 text-xl">
            {t("signin.title", { name: "AhaChat" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <EmailPasswordSignIn />

            <OrSeparator />

            <MagicLinkSignIn />

            <OrSeparator />

            <div className="flex flex-col items-center space-y-4">
              <GoogleButton
                className="w-full"
                onClick={async () => {
                  await authClient.signIn.social({
                    provider: "google",
                  })
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <AcceptTermsAndPolicy
        privacyPolicy="/privacy-policy"
        termsOfService="/terms-of-service"
      />
    </div>
  )
}

const AcceptTermsAndPolicy = ({
  termsOfService,
  privacyPolicy,
}: {
  termsOfService: string
  privacyPolicy: string
}) => {
  const t = useTranslations()

  return (
    <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
      <span>{t("signin.acceptTermsAndPolicy")}</span>{" "}
      <Link href={termsOfService}>{t("signin.termsOfService")}</Link>{" "}
      <span>{t("signin.and")}</span>{" "}
      <Link href={privacyPolicy}>{t("signin.privacyPolicy")}</Link>
    </div>
  )
}

export const OrSeparator = () => {
  const t = useTranslations()

  return (
    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-border after:border-t">
      <span className="relative z-10 bg-background px-4 font-medium text-muted-foreground text-uppercase text-xs">
        {t("texts.or")}
      </span>
    </div>
  )
}
