"use client"

import {
  Card,
  CardContent,
  CardHeader,
} from "@chatbotx.io/ui/components/ui/card"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { isCommunity } from "@/env"
import SSOSignIn from "@/features/auth/sso-sign-in"
import { usePlatformSettings } from "../platform"
import { EmailPasswordSignIn } from "./components/email-password-sign-in"
import { MagicLinkSignIn } from "./components/magic-link-signin"
import {
  AcceptTermsAndPolicy,
  AuthHeader,
  OrSeparator,
} from "./components/shared"

export type SignInFormProps = {
  callbackUrl?: string
}

export const SignInForm = ({ callbackUrl, ...props }: SignInFormProps) => {
  const t = useTranslations()
  const { name } = usePlatformSettings()

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <AuthHeader title={t("auth.signInTitle", { name })} />
        </CardHeader>

        <CardContent>
          <div className="grid gap-6">
            <EmailPasswordSignIn />

            <OrSeparator />

            <MagicLinkSignIn />

            {!isCommunity && (
              <>
                <OrSeparator />
                <SSOSignIn />
              </>
            )}

            <div className="text-center font-medium text-foreground/60 text-sm">
              {t("auth.dontHaveAnAccount")}{" "}
              <Link className="text-foreground underline" href="/auth/sign-up">
                {t("auth.signUp")}
              </Link>
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
