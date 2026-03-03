"use client"

import { Card, CardContent, CardHeader } from "@aha.chat/ui/components/ui/card"
import Link from "next/link"
import { useTranslations } from "next-intl"
import SSOSignUp from "@/enterprise/features/auth/sso-sign-in"
import { isCommunity } from "@/env"
import { EmailPasswordSignUp } from "./components/email-password-sign-up"
import {
  AcceptTermsAndPolicy,
  AuthHeader,
  OrSeparator,
} from "./components/shared"

export type SignUpFormProps = {
  brandName: string
  callbackUrl?: string
}

export const SignUpForm = ({
  brandName,
  callbackUrl,
  ...props
}: SignUpFormProps) => {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <AuthHeader
            brandName={brandName}
            title={t("auth.signUpTitle", { name: brandName })}
          />
        </CardHeader>

        <CardContent>
          <div className="grid gap-6">
            <EmailPasswordSignUp />

            {!isCommunity && (
              <>
                <OrSeparator />
                <SSOSignUp />
              </>
            )}

            <div className="text-center font-medium text-foreground/60 text-sm">
              {t("auth.alreadyHaveAnAccount")}{" "}
              <Link className="text-foreground underline" href="/auth/sign-in">
                {t("auth.signIn")}
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
