import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AccountFieldsTable } from "@/features/account-fields/account-field-table"
import { listAccountFields } from "@/features/account-fields/queries/list-account-fields.query"
import { listAccountFieldsSearchParams } from "@/features/account-fields/schemas/list-account-fields.schema"
import { T } from "@/tolgee/server"

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
        <h3 className="flex-1 font-bold text-xl">
          <T keyName="accountField.title" />
        </h3>
      </div>

      <Suspense>
        <AccountFieldsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </div>
  )
}
