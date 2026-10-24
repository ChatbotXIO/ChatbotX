import {
  isSuperAdmin,
  workspaceDeletionRecordService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { DeletedWorkspacesTable } from "@/features/admin-workspaces/deleted-workspaces-table"
import { getCurrentUser } from "@/lib/auth/utils"

export default async function DeletedWorkspacesPage() {
  const user = await getCurrentUser()
  if (!(user && (await isSuperAdmin(user)))) {
    return notFound()
  }

  const [t, records] = await Promise.all([
    getTranslations(),
    workspaceDeletionRecordService.listForAdmin({ page: 1, perPage: 50 }),
  ])

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("platformAdmin.workspaces.title")}
      </h3>
      <DeletedWorkspacesTable records={records.data} />
    </div>
  )
}
