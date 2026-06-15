"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
} from "@chatbotx.io/ui/components/ui/card"
import { MailIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useTenantSettings } from "../tenant"
import { AuthHeader } from "./components/shared"

export default function MagicLinkSent() {
  const t = useTranslations()
  const { name } = useTenantSettings()

  return (
    <Card>
      <CardHeader className="text-center">
        <AuthHeader title={t("auth.magicLinkSentTitle", { name })} />
      </CardHeader>

      <CardContent className="text-center">
        <div className="mb-6 flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <MailIcon className="h-6 w-6 text-blue-600" />
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              {t("auth.magicLinkSent")}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("auth.magicLinkSentDescription")}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Button asChild className="w-full" variant="outline">
            <Link href="/auth/sign-in">{t("actions.backToSignIn")}</Link>
          </Button>

          <div className="text-muted-foreground text-xs">
            <p>{t("auth.didNotReceiveEmail")}</p>
            <p>{t("auth.trySigningInAgain")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
