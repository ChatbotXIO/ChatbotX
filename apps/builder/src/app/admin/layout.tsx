import { isSuperAdmin } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { isCloud } from "@/env"
import { getCurrentUser } from "@/lib/auth/utils"

/**
 * SaaS-operator console. Gated to the real platform admin
 * (PLATFORM_ADMIN_EMAIL) and only meaningful in cloud — self-hosted admins
 * already manage the platform-scoped credentials through `/manage`.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!(user && isCloud() && isSuperAdmin(user))) {
    return notFound()
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-4 pb-24 sm:px-6 sm:pt-6">
      {children}
    </main>
  )
}
