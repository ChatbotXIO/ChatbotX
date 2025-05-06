import { AccountFieldsTable } from "@/features/account-fields/account-field-table"
import { listAccountFields } from "@/features/account-fields/queries/list-account-fields.query"
import { listAccountFieldsSearchParams } from "@/features/account-fields/schemas/list-account-fields.schema"
import { T } from "@/tolgee/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function AccountFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams

  const search = listAccountFieldsSearchParams.parse(searchParams)

  const promises = Promise.all([
    listAccountFields({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <div>
      <div className="flex items-center">
        <h3 className="font-bold flex-1 text-xl">
          <T keyName="accountField.title" />
        </h3>
      </div>

      <Suspense>
        <AccountFieldsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </div>
  )
}
