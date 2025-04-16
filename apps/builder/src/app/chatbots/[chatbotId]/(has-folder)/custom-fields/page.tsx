import { CreateCustomFieldDialog } from "@/features/fields/create-custom-field-dialog"
import { CustomFieldsTable } from "@/features/fields/custom-field-table"
import { listCustomFields } from "@/features/fields/queries"
import { listCustomFieldsSearchParams } from "@/features/fields/schemas/get-fields-schema"
import { listFoldersSearchParams } from "@/features/folders/schemas/list-folders-schema"
import { T } from "@/tolgee/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

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
      folderId: folderId,
    }),
  ])
  return (
    <>
      <div className="flex items-center">
        <h3 className="font-bold flex-1">
          <T keyName="customField.header" />
        </h3>
        <CreateCustomFieldDialog
          chatbotId={params.chatbotId}
          folderId={folderId}
        />
      </div>
      <Suspense>
        <CustomFieldsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
