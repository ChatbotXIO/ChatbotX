"use client"

import type { SocialProvider } from "@chatbotx.io/auth/server"
import {
  Card,
  CardContent,
  CardHeader,
} from "@chatbotx.io/ui/components/ui/card"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { isCommunity } from "@/env"
import { GenericOAuthSignIn } from "@/features/auth/generic-oauth-sign-in"
import SSOSignUp from "@/features/auth/sso-sign-in"
import type { GenericOAuthButton } from "@/lib/auth/generic-oauth"
import { withCallbackUrlParam } from "@/lib/safe-callback-url"
import { useTenantSettings } from "../tenant"
import { EmailPasswordSignUp } from "./components/email-password-sign-up"
import {
  AcceptTermsAndPolicy,
  AuthHeader,
  OrSeparator,
} from "./components/shared"

export type SignUpFormProps = {
  /** Social providers configured for this tenant (own app or platform default). */
  enabledProviders?: SocialProvider[]
  genericOAuth?: GenericOAuthButton | null
  signUpAllowed: boolean
}

export const SignUpForm = ({
  enabledProviders = [],
  genericOAuth = null,
  signUpAllowed,
  ...props
}: SignUpFormProps) => {
  const t = useTranslations()
  const { name, policyUrl, termsOfServiceUrl } = useTenantSettings()
  const searchParams = useSearchParams()
  const signInHref = withCallbackUrlParam(
    "/auth/sign-in",
    searchParams.get("callbackURL"),
  )
  const hasSocialProviders = !isCommunity() && enabledProviders.length > 0

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <AuthHeader title={t("auth.signUpTitle", { name })} />
        </CardHeader>

        <CardContent>
          {signUpAllowed ? (
            <div className="grid gap-6">
              <EmailPasswordSignUp />

              {genericOAuth || hasSocialProviders ? (
                <>
                  <OrSeparator />
                  {genericOAuth ? (
                    <GenericOAuthSignIn
                      displayName={genericOAuth.displayName}
                      logoUrl={genericOAuth.logoUrl}
                    />
                  ) : null}
                  {hasSocialProviders ? (
                    <SSOSignUp providers={enabledProviders} />
                  ) : null}
                </>
              ) : null}

              <div className="text-center font-medium text-foreground/60 text-sm">
                {t("auth.alreadyHaveAnAccount")}{" "}
                <Link className="text-foreground underline" href={signInHref}>
                  {t("auth.signIn")}
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 text-center">
              <div className="grid gap-2">
                <h2 className="font-medium text-lg">
                  {t("auth.signUpDisabledTitle")}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {t("auth.signUpDisabledDescription")}
                </p>
              </div>
              <div className="font-medium text-foreground/60 text-sm">
                {t("auth.alreadyHaveAnAccount")}{" "}
                <Link className="text-foreground underline" href={signInHref}>
                  {t("auth.signIn")}
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AcceptTermsAndPolicy
        privacyPolicy={policyUrl ?? "https://chatbotx.io/privacy/"}
        termsOfService={termsOfServiceUrl ?? "https://chatbotx.io/terms/"}
      />
    </div>
  )
}
