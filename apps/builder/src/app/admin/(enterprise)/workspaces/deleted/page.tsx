import {
  isSuperAdmin,
  workspaceDeletionRecordService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { DeletedWorkspacesTable } from "@/features/admin-workspaces/deleted-workspaces-table"
import { getDeletedWorkspacesSearchParamsCache } from "@/features/admin-workspaces/schema/deleted-query"
import { getCurrentUser } from "@/lib/auth/utils"

export default async function DeletedWorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await getCurrentUser()
  if (!(user && (await isSuperAdmin(user)))) {
    return notFound()
  }

  const [t, search] = await Promise.all([
    getTranslations(),
    getDeletedWorkspacesSearchParamsCache.parse(await searchParams),
  ])
  const records = workspaceDeletionRecordService.listForAdmin({
    ...search,
    search: search.search ?? undefined,
  })

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-lg sm:text-xl">
          {t("platformAdmin.workspaces.deletedTitle")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("platformAdmin.workspaces.deletedDescription")}
        </p>
      </div>
      <Suspense>
        <DeletedWorkspacesTable promises={Promise.all([records])} />
      </Suspense>
    </div>
  )
}
