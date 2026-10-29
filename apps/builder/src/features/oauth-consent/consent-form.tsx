"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { submitOAuthConsentAction } from "./actions/consent.action"

type OAuthConsentFormProps = {
  clientName: string
  consentCode: string
  scopes: string[]
  userEmail: string
}

export const OAuthConsentForm = ({
  clientName,
  consentCode,
  scopes,
  userEmail,
}: OAuthConsentFormProps) => {
  const t = useTranslations("oauthConsent")
  const { execute, isPending } = useAction(submitOAuthConsentAction, {
    onSuccess: ({ data }) => {
      if (!data?.redirectURI) {
        toast.error(t("failed"))
        return
      }
      window.location.assign(data.redirectURI)
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t("failed"))
    },
  })

  const handleConsent = (accept: boolean) => {
    execute({ accept, consentCode })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t("title", { clientName })}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("signedInAs")}</dt>
              <dd className="font-medium">{userEmail}</dd>
            </div>
          </dl>
          <section aria-labelledby="oauth-permissions-title">
            <h2 className="font-medium" id="oauth-permissions-title">
              {t("permissionsTitle")}
            </h2>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground text-sm">
              {scopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </section>
          <div className="flex justify-end gap-3">
            <Button
              disabled={isPending}
              onClick={() => handleConsent(false)}
              type="button"
              variant="outline"
            >
              {t("deny")}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => handleConsent(true)}
              type="button"
            >
              {t("approve")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
