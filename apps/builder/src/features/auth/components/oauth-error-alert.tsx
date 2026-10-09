"use client"

import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import {
  OAUTH_ERROR_MESSAGE_KEYS,
  type OAuthErrorKey,
  resolveOAuthErrorKey,
} from "../oauth-error"

/** Explains why an OAuth sign-in bounced back here instead of a blank form. */
export const OAuthErrorAlert = () => {
  const t = useTranslations()
  const searchParams = useSearchParams()
  // `window` is read after mount only: this component is server-rendered, and
  // the nested-callbackURL case needs the live origin to stay same-site.
  const [key, setKey] = useState<OAuthErrorKey | null>(null)
  useEffect(() => {
    setKey(resolveOAuthErrorKey(searchParams, window.location.origin))
  }, [searchParams])

  if (!key) {
    return null
  }
  return (
    <Alert role="alert" variant="destructive">
      <AlertDescription>{t(OAUTH_ERROR_MESSAGE_KEYS[key])}</AlertDescription>
    </Alert>
  )
}
