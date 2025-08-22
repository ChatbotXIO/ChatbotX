import { Button } from "@aha.chat/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { WhatsappMessageTemplatesTable } from "@/features/integration-whatsapp/message-templates/message-templates-table"
import { getMessageTemplates } from "@/features/integration-whatsapp/message-templates/queries"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const t = await getTranslations()

  const promises = Promise.all([
    getMessageTemplates({
      chatbotId,
      page: 1,
      perPage: 9999,
    }),
  ])

  return (
    <div>
      <div className="mb-4 flex w-full justify-end">
        <div className="mb-4 flex w-full justify-end">
          <Button asChild size="sm">
            <Link
              href={`/chatbots/${chatbotId}/whatsapp/message-templates/create`}
            >
              <PlusIcon />
              {t("actions.add")}
            </Link>
          </Button>
        </div>
      </div>
      <Suspense>
        <WhatsappMessageTemplatesTable
          chatbotId={chatbotId}
          promises={promises}
        />
      </Suspense>
    </div>
  )
}
