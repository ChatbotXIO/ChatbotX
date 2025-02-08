import { Button } from "@/components/ui/button"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import { signIn } from "./google-sheets"

export function GoogleSheetsAuth() {
  return (
    <form
      action={async () => {
        "use server"
        try {
          await signIn("GoogleSheets", {
            // redirectTo: callbackUrl ?? "",
          })
        } catch (error) {
          // Signin can fail for a number of reasons, such as the user
          // not existing, or the user not having the correct role.
          // In some cases, you may want to redirect to a custom error
          if (error instanceof AuthError) {
            return redirect(`/signin?error=${error.type}`)
          }
          // Otherwise if a redirects happens Next.js can handle it
          // so you can just re-thrown the error and let Next.js handle it.
          // Docs:
          // https://nextjs.org/docs/app/api-reference/functions/redirect#server-component
          throw error
        }
      }}
    >
      <Button variant="outline" size="xl" className="w-full text-left">
        <span>
          Sign in with Google
          {/* <T keyName="signin.provider_label" /> {provider.name} */}
        </span>
      </Button>
    </form>
  )
}
