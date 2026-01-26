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
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import GoogleButton from "react-google-button"
import { authClient } from "@/lib/auth/auth-client"
import { EmailPasswordSignIn } from "./components/email-password-signin"
import { MagicLinkSignIn } from "./components/magic-link-signin"

export type SignInFormProps = {
  brandName: string
  callbackUrl?: string
}

export const SignInForm = ({
  brandName,
  callbackUrl,
  ...props
}: SignInFormProps) => {
  const t = useTranslations()
  const { theme, systemTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = theme === "system" ? systemTheme : theme
  const logoSrc =
    currentTheme === "dark" ? "/brand/logo_white.svg" : "/brand/logo_black.svg"

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-4">
            {mounted && (
              <Image
                alt={brandName}
                className="h-20 w-auto"
                height={80}
                priority={true}
                src={logoSrc}
                width={64}
              />
            )}
          </div>
          <CardTitle className="text-slate-600 text-xl">
            {t("signIn.title", { name: brandName })}
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
      <span>{t("signIn.acceptTermsAndPolicy")}</span>{" "}
      <Link href={termsOfService}>{t("signIn.termsOfService")}</Link>{" "}
      <span>{t("signIn.and")}</span>{" "}
      <Link href={privacyPolicy}>{t("signIn.privacyPolicy")}</Link>
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
