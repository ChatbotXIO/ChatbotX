import type { SearchParams } from "next/dist/server/request/search-params"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import z from "zod"
import InboxCardList from "@/features/inboxes/components/inbox-card-list"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { listInboxes } from "@/features/inboxes/queries"
import { findRefLink } from "@/features/ref-links/queries"

export default async function LinkPage(props: {
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()
  const searchParams = await props.searchParams

  console.log(searchParams)
  const { data } = z
    .object({
      chatbotId: z.cuid2(),
      ref: z.string(),
    })
    .safeParse(searchParams)

  if (!(data && (data.ref.startsWith("r_") || data.ref.startsWith("f_")))) {
    return notFound()
  }

  const refLink = await findRefLink({
    chatbotId: data.chatbotId,
    id: data.ref.split("_")[1],
  })
  const { data: inboxes } = await listInboxes({
    chatbotId: data.chatbotId,
    includes: ["integration"],
    perPage: 1000,
  })
  if (!refLink) {
    return notFound()
  }

  return (
    <div className="mx-auto my-20 flex w-full max-w-[400px] flex-col items-center">
      <InboxStoreProvider autoInitialize={true} chatbotId={data.chatbotId}>
        <InboxCardList
          actionLabel={t("actions.continue")}
          allowAddNew={false}
          chatbotId={data.chatbotId}
          direction="vertical"
          inboxes={inboxes}
          refId={data.ref}
        />
      </InboxStoreProvider>
    </div>
  )
}
