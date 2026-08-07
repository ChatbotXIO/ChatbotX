"use client"

import type { SocialProvider } from "@chatbotx.io/auth/server"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { authClient } from "@/lib/auth/auth-client"

type SSOSignInProps = {
  /** Providers configured for this tenant (own app or platform default). */
  providers: SocialProvider[]
}

const signInWith = async (provider: SocialProvider): Promise<void> => {
  // Carry the current (reseller) origin into the OAuth state so the fixed
  // platform callback can recover this tenant and relay the user back to their
  // branded domain. See `resolveTenantFromOAuthState` and the route relay.
  await authClient.signIn.social({
    provider,
    callbackURL: window.location.origin,
  })
}

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 48 48" width="20">
      <path
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        fill="#4285F4"
      />
      <path
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        fill="#34A853"
      />
      <path
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        fill="#FBBC05"
      />
      <path
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function SSOSignIn({ providers }: SSOSignInProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center gap-3">
      {providers.includes("facebook") && (
        <Button
          aria-label={t("auth.continueWithFacebook")}
          className="w-full bg-[#1877F2] text-white hover:bg-[#0F6FE5]"
          onClick={async () => {
            await signInWith("facebook")
          }}
          type="button"
        >
          <FacebookIcon />
          {t("auth.continueWithFacebook")}
        </Button>
      )}

      {providers.includes("google") && (
        <Button
          aria-label={t("auth.continueWithGoogle")}
          className="w-full"
          onClick={async () => {
            await signInWith("google")
          }}
          type="button"
          variant="outline"
        >
          <GoogleIcon />
          {t("auth.continueWithGoogle")}
        </Button>
      )}
    </div>
  )
}
