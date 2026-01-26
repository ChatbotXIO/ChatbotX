"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { CheckCircleIcon, MailIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export default function MagicLinkSent({ brandName }: { brandName: string }) {
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
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <h1 className="flex items-center gap-2 self-center font-medium text-3xl">
          <div className="flex items-center justify-center text-primary-foreground">
            {mounted && (
              <Image
                alt={brandName}
                className="h-20 w-auto"
                height={80}
                priority={true}
                src={logoSrc}
                width={48}
              />
            )}
          </div>
          {brandName}
        </h1>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircleIcon className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-xl">
              {t("signIn.checkYourEmail")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="mb-6 flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <MailIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">
                  {t("signIn.magicLinkSent")}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("signIn.magicLinkSentDescription")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Button asChild className="w-full" variant="outline">
                <Link href="/signIn">{t("actions.backToSignIn")}</Link>
              </Button>

              <div className="text-muted-foreground text-xs">
                <p>{t("signIn.didNotReceiveEmail")}</p>
                <p>{t("signIn.trySigningInAgain")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
