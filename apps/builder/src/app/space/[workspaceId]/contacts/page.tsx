import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { listContacts } from "@/features/contacts/queries/list-contacts.queries"
import { listContactsRequest } from "@/features/contacts/schemas/query"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { listLifecycleStages } from "@/features/lifecycle-stages/queries"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"

export default async function ContactsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()
  const searchParams = await props.searchParams
  // safeParse precisa de workspaceId (vem do path, não da query). Normaliza
  // lifecycleStageId single → array antes de parsear (sidebar manda single).
  const normalized: Record<string, unknown> = {
    ...searchParams,
    workspaceId,
  }
  if (typeof searchParams.lifecycleStageId === "string") {
    normalized.lifecycleStageIds = [searchParams.lifecycleStageId]
  }
  const { data: search } = listContactsRequest.safeParse(normalized)

  const promises = Promise.all([
    listContacts({
      ...search,
      workspaceId,
    }),
  ])
  const lifecycleStages = await listLifecycleStages(workspaceId)

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("contacts.title")} />
      <div className="flex-1 overflow-y-auto px-6 pt-2 pb-6">
        <Suspense>
          <UserStoreProvider workspaceId={workspaceId}>
            <TagStoreProvider workspaceId={workspaceId}>
              <CustomFieldStoreProvider workspaceId={workspaceId}>
                <InboxStoreProvider workspaceId={workspaceId}>
                  <ContactsTable
                    lifecycleStages={lifecycleStages}
                    promises={promises}
                    workspaceId={workspaceId}
                  />
                </InboxStoreProvider>
              </CustomFieldStoreProvider>
            </TagStoreProvider>
          </UserStoreProvider>
        </Suspense>
      </div>
    </div>
  )
}
