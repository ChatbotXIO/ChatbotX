import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ChangePassword } from "@/features/auth/change-password"
import { auth } from "@/lib/auth/auth"

export default async function ChangePasswordPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    redirect("/auth/sign-in")
  }

  if (!session.user.mustChangePassword) {
    redirect("/")
  }

  return <ChangePassword />
}
