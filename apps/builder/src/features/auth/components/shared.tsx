"use client"

import { CardTitle } from "@aha.chat/ui/components/ui/card"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"

export type AuthHeaderProps = {
  brandName: string
  title: string
}

export const AuthHeader = ({ brandName, title }: AuthHeaderProps) => {
  const { theme, systemTheme } = useTheme()

  const currentTheme = theme === "system" ? systemTheme : theme
  const logoSrc =
    currentTheme === "dark" ? "/brand/logo_white.svg" : "/brand/logo_black.svg"

  return (
    <>
      <div className="flex items-center justify-center gap-4">
        <Image
          alt={brandName}
          className="h-20 w-auto"
          height={80}
          priority={true}
          src={logoSrc}
          width={64}
        />
      </div>

      <CardTitle className="text-slate-600 text-xl">{title}</CardTitle>
    </>
  )
}

export const AcceptTermsAndPolicy = ({
  termsOfService,
  privacyPolicy,
}: {
  termsOfService: string
  privacyPolicy: string
}) => {
  const t = useTranslations()

  return (
    <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary">
      <span>{t("auth.acceptTermsAndPolicy")}</span>{" "}
      <Link href={termsOfService}>{t("auth.termsOfService")}</Link>{" "}
      <span>{t("auth.and")}</span>{" "}
      <Link href={privacyPolicy}>{t("auth.privacyPolicy")}</Link>
    </div>
  )
}

export const OrSeparator = () => {
  const t = useTranslations()

  return (
    <div className="relative flex h-4 w-full items-center justify-center text-center text-sm">
      <hr className="w-full" />
      <span className="absolute bg-card px-2 font-medium text-foreground/60 text-sm">
        {t("auth.orContinueWith")}
      </span>
    </div>
  )
}
