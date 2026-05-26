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
  const { data: search } = listContactsRequest.safeParse(searchParams)

  const promises = Promise.all([
    listContacts({
      ...search,
      workspaceId,
    }),
  ])
  const lifecycleStages = await listLifecycleStages(workspaceId)

  return (
    <>
      {/*
        PageHeader padronizado h-[52px] (mesmo padrão do Respond.io).
        Substituiu o <h4> antigo solto no fluxo da página.
      */}
      <PageHeader className="-mx-6 -mt-6 mb-2" title={t("contacts.title")} />

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
    </>
  )
}
