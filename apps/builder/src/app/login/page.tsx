import { signIn } from "@/auth"
import { providerMap } from "@/auth.config"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"

export default async function SignInPage(props: {
  searchParams: Promise<{ callbackUrl: string | undefined }>
}) {
  return (
    <div className="flex h-screen w-full items-center justify-center px-4">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-3xl bold uppercase text-center">
            Login
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {Object.values(providerMap).map((provider) => (
              <form
                key={provider.id}
                action={async () => {
                  "use server"
                  try {
                    await signIn(provider.id, {
                      redirectTo: (await props.searchParams)?.callbackUrl ?? "",
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
                <Button
                  variant="outline"
                  size="xl"
                  className="w-full text-left"
                >
                  <span>Sign in with {provider.name}</span>
                </Button>
              </form>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
