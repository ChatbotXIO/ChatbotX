import { rootFolderId } from "@aha.chat/database/enums"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AccountFieldsTable } from "@/features/account-fields/account-field-table"
import { listAccountFields } from "@/features/account-fields/queries/list-account-fields.query"
import { listAccountFieldsSearchParams } from "@/features/account-fields/schemas/query"

export default async function AccountFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const t = await getTranslations()

  const search = listAccountFieldsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listAccountFields({
      ...search,
      chatbotId: params.chatbotId,
      folderId,
    }),
  ])

  return (
    <div>
      <div className="flex items-center">
        <h3 className="flex-1 font-bold text-xl">
          {t("fields.accountField.label")}
        </h3>
      </div>

      <Suspense>
        <AccountFieldsTable
          chatbotId={params.chatbotId}
          folderId={folderId}
          promises={promises}
        />
      </Suspense>
    </div>
  )
}
