import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AdminWorkspacesTable } from "@/features/admin-workspaces/admin-workspaces-table"
import { listAdminWorkspaces } from "@/features/admin-workspaces/queries"
import { getAdminWorkspacesSearchParamsCache } from "@/features/admin-workspaces/schema/query"

export default async function AdminWorkspacesPage() {
  const t = await getTranslations()

  const promises = Promise.all([
    listAdminWorkspaces(getAdminWorkspacesSearchParamsCache.parse({})),
  ])

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-lg sm:text-xl">
          {t("platformAdmin.workspaces.title")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("platformAdmin.workspaces.description")}
        </p>
      </div>

      <Suspense>
        <AdminWorkspacesTable promises={promises} />
      </Suspense>
    </div>
  )
}
