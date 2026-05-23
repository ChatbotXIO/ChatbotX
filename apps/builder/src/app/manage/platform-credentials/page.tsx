import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { ManagePlatformCredentials } from "@/features/platform-credentials/manage-platform-credentials"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function ManagePlatformCredentialsPage() {
  const t = await getTranslations()

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("platformCredentials.title")}
      </h3>

      <Suspense>
        <ManagePlatformCredentials userId={userId} />
      </Suspense>
    </div>
  )
}
