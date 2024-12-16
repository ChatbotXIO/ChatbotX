import { redirect } from "next/navigation"
import { providerMap } from "@/auth.config"
import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import Link from "next/link"

export default async function SignInPage(props: {
  searchParams: { callbackUrl: string | undefined }
}) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-900">
      <Card className="rounded-none border-none bg-transparent mx-auto w-1/4 min-w-min max-w-lg">
        <CardHeader className="mb-4">
          <CardTitle className="text-4xl bold text-white text-center">
            <div className="w-full h-32 relative mb-2">
              <Image
                src="/assets/images/logo.svg"
                alt="AhaChat Logo"
                fill
                style={{ objectFit: "contain" }}
                className="p-2"
              />
            </div>
            <h1>Sign In</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-white text-center text-lg p-4">Don&apos;t have an account? <Link href="/sign-up" className="underline">Sign up for free</Link></div>
          <div className="flex flex-col gap-2">
            {Object.values(providerMap).map((provider, providerMapIdx) => (
              <form key={providerMapIdx}
                action={async () => {
                  "use server"
                  try {
                    await signIn(provider.id, {
                      redirectTo: props.searchParams?.callbackUrl ?? "/chatbots/1/dashboard", //fake url
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
                {provider.name !== 'Nodemailer' ? (
                  <Button variant="outline" size="xl" className="w-full border border-gray-700 bg-transparent hover:bg-slate-100 text-white">
                    <Image src={`/assets/images/logo_${provider.name}.svg`} alt="providerLogo" width={20} height={20}></Image>
                    <span className="text-base font-bold">Continue with {provider.name}</span>
                  </Button>
                ) : (
                  <>
                    {/* <div className="flex items-center my-4 px-4">
                      <hr className="flex-grow border-t border-gray-700" />
                      <span className="mx-4 text-white">Or with your email</span>
                      <hr className="flex-grow border-t border-gray-700" />
                    </div>
                    <div className="flex w-full items-center space-x-2">
                      <Input type="email" placeholder="Email" />
                      <Button type="submit">Subscribe</Button>
                    </div> */}
                  </>
                )}
              </form>
            ))}
            <div className="flex items-center my-4 px-4">
              <hr className="flex-grow border-t border-gray-700" />
              <span className="mx-4 text-white">Or with your email</span>
              <hr className="flex-grow border-t border-gray-700" />
            </div>
            <div className="flex w-full items-center space-x-2">
              <Input className="h-12 border-gray-700 bg-transparent text-base" type="email" placeholder="email@company.com" />
              <Button size="xl" className="w-1/4 bg-shark text-base hover:bg-gray-800" type="submit">Submit</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
