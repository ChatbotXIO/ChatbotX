"use client"

import {
  Card,
  CardContent,
  CardHeader,
} from "@chatbotx.io/ui/components/ui/card"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { isCommunity } from "@/env"
import SSOSignUp from "@/features/auth/sso-sign-in"
import { useTenantSettings } from "../tenant"
import { EmailPasswordSignUp } from "./components/email-password-sign-up"
import {
  AcceptTermsAndPolicy,
  AuthHeader,
  OrSeparator,
} from "./components/shared"

export type SignUpFormProps = {
  callbackUrl?: string
  /** Whether Google login is configured for this tenant (own app or platform default). */
  googleEnabled?: boolean
}

export const SignUpForm = ({
  callbackUrl,
  googleEnabled = false,
  ...props
}: SignUpFormProps) => {
  const t = useTranslations()
  const { name } = useTenantSettings()

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <AuthHeader title={t("auth.signUpTitle", { name })} />
        </CardHeader>

        <CardContent>
          <div className="grid gap-6">
            <EmailPasswordSignUp />

            {!isCommunity() && googleEnabled && (
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
