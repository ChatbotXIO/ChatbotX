"use client"

import type { SocialProvider } from "@chatbotx.io/auth/server"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
} from "@chatbotx.io/ui/components/ui/card"
import { ArrowLeftIcon, LinkIcon, MailIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { isCommunity } from "@/env"
import SSOSignIn from "@/features/auth/sso-sign-in"
import { useTenantSettings } from "../tenant"
import { EmailPasswordSignIn } from "./components/email-password-sign-in"
import { MagicLinkSignIn } from "./components/magic-link-signin"
import {
  AcceptTermsAndPolicy,
  AuthHeader,
  OrSeparator,
} from "./components/shared"

type SignInMethod = "email" | "magicLink"

export type SignInFormProps = {
  callbackUrl?: string
  /** Social providers configured for this tenant (own app or platform default). */
  enabledProviders?: SocialProvider[]
}

export const SignInForm = ({
  callbackUrl,
  enabledProviders = [],
  ...props
}: SignInFormProps) => {
  const t = useTranslations()
  const { name, policyUrl, termsOfServiceUrl } = useTenantSettings()
  const [activeMethod, setActiveMethod] = useState<SignInMethod | null>(null)

  return (
    <div className="flex flex-col gap-6" {...props}>
      <Card>
        <CardHeader className="text-center">
          <AuthHeader title={t("auth.signInTitle", { name })} />
        </CardHeader>

        <CardContent>
          <div className="grid gap-6">
            {activeMethod ? (
              <>
                {activeMethod === "email" ? (
                  <EmailPasswordSignIn />
                ) : (
                  <MagicLinkSignIn />
                )}

                <Button
                  className="w-fit text-foreground/60"
                  onClick={() => setActiveMethod(null)}
                  type="button"
                  variant="ghost"
                >
                  <ArrowLeftIcon className="size-4 rtl:rotate-180" />
                  {t("actions.back")}
                </Button>
              </>
            ) : (
              <>
                {!isCommunity() && enabledProviders.length > 0 && (
                  <>
                    <SSOSignIn providers={enabledProviders} />
                    <OrSeparator />
                  </>
                )}

                <div className="flex flex-col gap-3">
                  <Button
                    className="w-full"
                    onClick={() => setActiveMethod("email")}
                    type="button"
                    variant="outline"
                  >
                    <MailIcon />
                    {t("auth.continueWithEmail")}
                  </Button>

                  <Button
                    className="w-full"
                    onClick={() => setActiveMethod("magicLink")}
                    type="button"
                    variant="outline"
                  >
                    <LinkIcon />
                    {t("auth.continueWithMagicLink")}
                  </Button>
                </div>
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
        privacyPolicy={policyUrl ?? "https://chatbotx.io/privacy/"}
        termsOfService={termsOfServiceUrl ?? "https://chatbotx.io/terms/"}
      />
    </div>
  )
}
