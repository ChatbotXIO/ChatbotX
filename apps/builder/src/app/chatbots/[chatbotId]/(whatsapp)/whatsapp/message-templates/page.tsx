import { getMessageTemplates } from "@/features/integration-whatsapp/message-templates/queries"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { T } from "@/tolgee/server"
import { Suspense } from "react"
import { MessageTemplatesTable } from "@/features/integration-whatsapp/message-templates/message-templates-table"
import type { SearchParams } from "nuqs/server"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const promises = Promise.all([
    getMessageTemplates({
      chatbotId,
      page: 1,
      perPage: 9999,
    }),
  ])

  return (
    <div>
      <div className="flex w-full justify-end mb-4">
        <div className="flex w-full justify-end mb-4">
          <Button size="sm" asChild>
            <Link
              href={`/chatbots/${chatbotId}/whatsapp/message-templates/create`}
            >
              <PlusIcon />
              <T keyName="common.addBtn" />
            </Link>
          </Button>
        </div>
      </div>
      <Suspense>
        <MessageTemplatesTable promises={promises} chatbotId={chatbotId} />
      </Suspense>
    </div>
  )
}
