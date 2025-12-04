import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateCustomFieldDialog } from "@/features/custom-fields/create-custom-field"
import { CustomFieldsTable } from "@/features/custom-fields/custom-field-table"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { listFoldersSearchParams } from "@/features/folders/schemas/list-folders-schema"

export default async function CustomFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listCustomFieldsSearchParams.parse(searchParams)
  const { folderId } = listFoldersSearchParams.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    listCustomFields({
      ...search,
      page: search.page ?? 1,
      perPage: search.perPage ?? 10,
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
