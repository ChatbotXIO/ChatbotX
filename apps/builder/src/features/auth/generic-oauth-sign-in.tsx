"use client"

import { GENERIC_OAUTH_PROVIDER_ID } from "@chatbotx.io/auth/client"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { authClient } from "@/lib/auth/auth-client"
import { resolveSafeCallbackUrl } from "@/lib/safe-callback-url"

type GenericOAuthSignInProps = {
  displayName: string
  logoUrl?: string
}

export const GenericOAuthSignIn = ({
  displayName,
  logoUrl,
}: GenericOAuthSignInProps) => {
  const t = useTranslations()
  const searchParams = useSearchParams()
  const callbackParam = searchParams.get("callbackURL")
  const buttonLabel = t("auth.continueWithProvider", { name: displayName })

  const handleSignIn = async (): Promise<void> => {
    const { origin } = window.location
    await authClient.signIn.social({
      provider: GENERIC_OAUTH_PROVIDER_ID,
      callbackURL: new URL(
        resolveSafeCallbackUrl(callbackParam, origin),
        origin,
      ).toString(),
      errorCallbackURL: new URL("/auth/sign-in", origin).toString(),
    })
  }

  return (
    <Button
      aria-label={buttonLabel}
      className="w-full"
      onClick={handleSignIn}
      type="button"
      variant="outline"
    >
      {logoUrl ? (
        <Image alt="" height={20} src={logoUrl} unoptimized width={20} />
      ) : null}
      {buttonLabel}
    </Button>
  )
}
