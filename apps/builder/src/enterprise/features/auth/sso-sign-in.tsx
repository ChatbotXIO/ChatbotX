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
          })
        }}
      />
    </div>
  )
}
