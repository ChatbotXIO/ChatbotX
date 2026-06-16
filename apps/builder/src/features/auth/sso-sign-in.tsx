"use client"

import type { SocialProvider } from "@chatbotx.io/auth/server"
import GoogleButton from "react-google-button"
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

// function FacebookIcon() {
//   return (
//     <svg
//       aria-hidden="true"
//       fill="currentColor"
//       height="20"
//       viewBox="0 0 24 24"
//       width="20"
//     >
//       <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
//     </svg>
//   )
// }

export default function SSOSignIn({ providers }: SSOSignInProps) {
  // const t = useTranslations()

  return (
    <div className="flex flex-col items-center gap-3">
      {providers.includes("google") && (
        <GoogleButton
          className="w-full"
          onClick={async () => {
            await signInWith("google")
          }}
        />
      )}

      {/* {providers.includes("facebook") && (
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
      )} */}
    </div>
  )
}
