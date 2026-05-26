import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { PageHeader } from "@/components/page-header"
import { ContactsAreaSidebar } from "@/features/contacts/components/contacts-area-sidebar"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { countBlockedContacts } from "@/features/contacts/queries/count-blocked-contacts"
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
  // safeParse precisa de workspaceId (zodBigintAsString) pra passar — vem do
  // path param, não da query string. Sem isso `search` vira undefined e o
  // filtro `?blocked=1` não chega na query (bug pego em 2026-05-26).
  const { data: search } = listContactsRequest.safeParse({
    ...searchParams,
    workspaceId,
  })

  const [, lifecycleStages, blockedContactsCount] = await Promise.all([
    Promise.resolve(null),
    listLifecycleStages(workspaceId),
    countBlockedContacts(workspaceId),
  ])

  const promises = Promise.all([
    listContacts({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <>
      <PageHeader className="-mx-6 -mt-6 mb-2" title={t("contacts.title")} />

      {/* Layout flex: sidebar fixa 215px + main expansível.
          Pixel-perfect Respond.io 2026-05-26 — Pedro pediu sidebar com
          item "Contatos bloqueados" no rodapé igual o Inbox. */}
      <div className="-mx-6 flex h-[calc(100vh-52px)]">
        <ContactsAreaSidebar
          blockedContactsCount={blockedContactsCount}
          workspaceId={workspaceId}
        />
        <div className="flex-1 overflow-y-auto px-6 pt-2">
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
    </>
  )
}
