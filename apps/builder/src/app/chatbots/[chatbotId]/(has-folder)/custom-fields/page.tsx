import { rootFolderId } from "@aha.chat/database/enums"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateCustomFieldDialog } from "@/features/custom-fields/create-custom-field"
import { CustomFieldsTable } from "@/features/custom-fields/custom-field-table"
import { listCustomFieldsRSC } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/query"

export default async function CustomFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()

  const params = await props.params
  const searchParams = await props.searchParams
  const search = await listCustomFieldsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listCustomFieldsRSC({
      ...search,
      chatbotId: params.chatbotId,
      folderId,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex">
        <h3 className="flex-1 font-bold">{t("fields.customField.label")}</h3>
        <CreateCustomFieldDialog
          chatbotId={params.chatbotId}
          folderId={folderId}
        />
      </div>

      <Suspense>
        <CustomFieldsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </div>
  )
}
