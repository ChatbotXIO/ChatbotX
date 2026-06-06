import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { ManagePlatformCredentials } from "@/features/platform-credentials/manage-platform-credentials"

export default async function AdminPlatformCredentialsPage() {
  const t = await getTranslations()

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-lg sm:text-xl">
          {t("platformAdmin.platformCredentials.title")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("platformAdmin.platformCredentials.description")}
        </p>
      </div>

      <Suspense>
        <ManagePlatformCredentials scope="platform" />
      </Suspense>
    </div>
  )
}
