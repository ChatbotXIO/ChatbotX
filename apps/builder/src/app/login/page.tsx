// import { redirect } from "next/navigation"
// import { providerMap } from "@/auth.config"
// import { signIn } from "@/auth"
// import { AuthError } from "next-auth"
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// import { Button } from "@/components/ui/button"
// import Image from "next/image"
// import Link from "next/link"

// export default async function SignInPage(props: {
//   searchParams: { callbackUrl: string | undefined }
// }) {
//   return (
//     <div className="flex h-screen w-full items-center justify-center bg-zinc-900">
//       <Card className="rounded-none border-none bg-transparent mx-auto w-1/4 max-w-lg">
//         <CardHeader className="mb-4">
//           <CardTitle className="text-4xl bold text-white text-center">
//             <div className="w-full h-32 relative mb-2">
//               <Image
//                 src="/assets/images/logo.svg"
//                 alt="AhaChat Logo"
//                 fill
//                 style={{ objectFit: "contain" }}
//                 className="p-2"
//               />
//             </div>
//             <h1>Sign In</h1>
//           </CardTitle>
//         </CardHeader>
//         <CardContent>
//           <div className="text-white text-center text-lg p-4">Don&apos;t have an account? <Link href="/sign-up" className="underline">Sign up for free</Link></div>
//           <div className="flex flex-col gap-2">
//             {Object.values(providerMap).map((provider, providerMapIdx) => (
//               <form key={providerMapIdx}
//                 action={async () => {
//                   "use server"
//                   try {
//                     await signIn(provider.id, {
//                       redirectTo: props.searchParams?.callbackUrl ?? "",
//                     })
//                   } catch (error) {
//                     // Signin can fail for a number of reasons, such as the user
//                     // not existing, or the user not having the correct role.
//                     // In some cases, you may want to redirect to a custom error
//                     if (error instanceof AuthError) {
//                       return redirect(`/signin?error=${error.type}`)
//                     }

//                     // Otherwise if a redirects happens Next.js can handle it
//                     // so you can just re-thrown the error and let Next.js handle it.
//                     // Docs:
//                     // https://nextjs.org/docs/app/api-reference/functions/redirect#server-component
//                     throw error
//                   }
//                 }}
//               >
//                 <Button variant="outline" size="xl" className="w-full border border-gray-700 bg-transparent hover:bg-slate-100 text-white">
//                   <Image src={`/assets/images/logo_${provider.name}.svg`} alt="providerLogo" width={20} height={20}></Image>
//                   <span className="text-base font-bold">Continue with {provider.name}</span>
//                 </Button>
//               </form>
//             ))}
//           </div>
//           Or with your email
//         </CardContent>
//       </Card>
//     </div>
//   )
// }


"use client"

import { useState } from "react"
import { redirect } from "next/navigation"
import { providerMap } from "@/auth.config"
import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { useForm, Controller, SubmitHandler, FieldValues } from "react-hook-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import Link from "next/link"

export default function SignInPage(props: {
  searchParams: { callbackUrl: string | undefined }
}) {
  const [emailEntered, setEmailEntered] = useState(false)
  const { control, handleSubmit, formState: { errors }, setValue } = useForm()  // Thêm setValue từ react-hook-form

  const handleEmailSubmit: SubmitHandler<FieldValues> = (data) => {
    setEmailEntered(true)
    setValue("email", data.email)
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-900">
      <Card className="rounded-none border-none bg-transparent mx-auto w-1/4 max-w-lg">
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
                  try {
                    await signIn(provider.id, {
                      redirectTo: props.searchParams?.callbackUrl ?? "",
                    })
                  } catch (error) {
                    if (error instanceof AuthError) {
                      return redirect(`/signin?error=${error.type}`)
                    }
                    throw error
                  }
                }}
              >
                <Button variant="outline" size="xl" className="w-full border border-gray-700 bg-transparent hover:bg-slate-100 text-white">
                  <Image src={`/assets/images/logo_${provider.name}.svg`} alt="providerLogo" width={20} height={20}></Image>
                  <span className="text-base font-bold">Continue with {provider.name}</span>
                </Button>
              </form>
            ))}

            <div className="flex items-center my-4 px-4">
              <hr className="flex-grow border-t border-gray-700" />
              <span className="mx-4 text-white">Or with your email</span>
              <hr className="flex-grow border-t border-gray-700" />
            </div>

            {!emailEntered ? (
              <form onSubmit={handleSubmit(handleEmailSubmit)} className="flex gap-4">
                <div className="flex w-3/4">
                  <Controller
                    name="email"
                    control={control}
                    rules={{
                      required: "Email is required",
                      pattern: {
                        value: /^\S+@\S+\.\S+$/,
                        message: "Invalid email format",
                      },
                    }}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="email"
                        placeholder="email@company.com"
                        className="w-full px-4 py-2 border border-gray-700 bg-transparent rounded text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                      />
                    )}
                  />
                  {errors.email && <span className="text-red-500 text-sm">{String(errors.email.message)}</span>}
                </div>

                <Button type="submit" variant="outline" size="xl" className="w-1/4 text-base font-bold border border-gray-700 bg-shark hover:bg-slate-100 text-white">
                  Submit
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-4 mt-4">
                <input
                  type="password"
                  placeholder="Enter your password"
                  className="w-full px-4 py-2 border border-gray-700 bg-transparent text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
                <Button variant="outline" size="xl" className="w-full border border-gray-700 bg-transparent hover:bg-slate-100 text-white">
                  Sign In
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
