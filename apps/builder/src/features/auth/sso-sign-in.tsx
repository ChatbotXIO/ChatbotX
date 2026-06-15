import GoogleButton from "react-google-button"
import { authClient } from "@/lib/auth/auth-client"

export default function SSOSignIn() {
  return (
    <div className="flex flex-col items-center space-y-4">
      <GoogleButton
        className="w-full"
        onClick={async () => {
          await authClient.signIn.social({
            provider: "google",
            // Carry the current (reseller) origin into the OAuth state so the
            // fixed platform callback can recover this tenant and route the user
            // back to their branded domain. See `resolveTenantFromOAuthState`.
            callbackURL: window.location.origin,
          })
        }}
      />
    </div>
  )
}
