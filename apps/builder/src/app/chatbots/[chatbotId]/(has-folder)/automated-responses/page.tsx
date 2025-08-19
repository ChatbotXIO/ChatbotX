import { Button } from "@aha.chat/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import type { SearchParams } from "nuqs/server"
import { AutomatedResponsesTable } from "@/features/automated-response/automated-response-table"
import { getAutomatedResponses } from "@/features/automated-response/queries"
import { listAutomatedResponsesSearchParams } from "@/features/automated-response/schemas/get-automated-responses-schema"
import { T } from "@/tolgee/server"

export default async function AutomatedResponesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = listAutomatedResponsesSearchParams.parse(searchParams)

  const promises = Promise.all([
    getAutomatedResponses({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <>
      <div className="flex items-center">
        <h4 className="flex-1 font-bold">
          <T keyName="automatedResponse.heading" />
        </h4>
        <Button asChild size={"sm"}>
          <Link href={`/chatbots/${chatbotId}/automated-responses/create`}>
            <PlusIcon />
            <T keyName="common.createBtn" />
          </Link>
        </Button>
      </div>

      <AutomatedResponsesTable chatbotId={chatbotId} promises={promises} />
    </>
  )
}
