"use client"

import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import Link from "next/link"
import { useTranslations } from "next-intl"
import SSOSignIn from "@/enterprise/features/auth/sso-sign-in"
import { isCommunity } from "@/env"
import { EmailPasswordSignIn } from "./components/email-password-sign-in"
import { MagicLinkSignIn } from "./components/magic-link-signin"
import {
  AcceptTermsAndPolicy,
  AuthHeader,
  OrSeparator,
} from "./components/shared"

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

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <AuthHeader
            brandName={brandName}
            title={t("auth.signInTitle", { name: brandName })}
          />
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
