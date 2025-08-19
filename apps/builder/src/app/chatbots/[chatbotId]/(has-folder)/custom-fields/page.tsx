import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateCustomFieldDialog } from "@/features/custom-fields/create-custom-field-dialog"
import { CustomFieldsTable } from "@/features/custom-fields/custom-field-table"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { listFoldersSearchParams } from "@/features/folders/schemas/list-folders-schema"
import { T } from "@/tolgee/server"

export default async function CustomFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listCustomFieldsSearchParams.parse(searchParams)
  const { folderId } = listFoldersSearchParams.parse(searchParams)

  const promises = Promise.all([
    listCustomFields({
      ...search,
      chatbotId: params.chatbotId,
      folderId,
    }),
  ])
  return (
    <>
      <div className="flex items-center">
        <h3 className="flex-1 font-bold">
          <T keyName="customField.header" />
        </h3>
        <CreateCustomFieldDialog
          chatbotId={params.chatbotId}
          folderId={folderId}
        />
      </div>
      <Suspense>
        <CustomFieldsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
