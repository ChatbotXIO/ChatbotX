import { signIn } from "@/auth"
import { providers } from "@/auth.config"
import { cn } from "@/components/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { T } from "@/tolgee/server"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"

export const SignInForm = ({
  className,
  callbackUrl,
  ...props
}: {
  className?: string
  callbackUrl?: string
}) => {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            <T keyName="signin.title" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <div className="flex flex-col gap-4">
              {providers.map((provider) =>
                provider.name === "nodemailer" ? null : (
                  <form
                    key={provider.name}
                    action={async () => {
                      "use server"
                      try {
                        await signIn(provider.name, {
                          redirectTo: callbackUrl ?? "",
                        })
                      } catch (error) {
                        // Signin can fail for a number of reasons, such as the user
                        // not existing, or the user not having the correct role.
                        // In some cases, you may want to redirect to a custom error
                        if (error instanceof AuthError) {
                          return redirect(`/signin?error=${error.message}`)
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
                      size="lg"
                      className="w-full text-left"
                    >
                      <span>
                        <T keyName="signin.provider_label" /> {provider.name}
                      </span>
                    </Button>
                  </form>
                ),
              )}
            </div>
            <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
              <span className="relative z-10 bg-background px-2 text-muted-foreground">
                <T keyName="signin.or" />
              </span>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server"
                await signIn("nodemailer", {
                  email: formData.get("email"),
                  redirectTo: "/",
                })
              }}
            >
              <div className="grid gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@ahachat.ai"
                    required
                    name="email"
                  />
                </div>
                <Button type="submit" className="w-full">
                  <T keyName="signin.continue" />
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-primary  ">
        By clicking continue, you agree to our <span>Terms of Service</span> and{" "}
        <span>Privacy Policy</span>.
      </div>
    </div>
  )
}
