import { Button } from "@/components/ui/button"
import { AutomatedResponsesTable } from "@/features/automated-response/automated-response-table"
import { getAutomatedResponses } from "@/features/automated-response/queries"
import { listAutomatedResponsesNuqs } from "@/features/automated-response/schemas/get-automated-responses-schema"
import { listFoldersSearchParams } from "@/features/folders/schemas/list-folders-schema"
import { getTranslate } from "@/tolgee/server"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import type { SearchParams } from "nuqs/server"

export default async function AutomatedResponesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = listAutomatedResponsesNuqs.parse(searchParams)
  const { folderId } = listFoldersSearchParams.parse(searchParams)

  const t = await getTranslate()

  const promises = Promise.all([
    getAutomatedResponses({
      ...search,
      chatbotId,
      folderId,
    }),
  ])

  return (
    <>
      <div className="flex items-center">
        <h4 className="font-bold flex-1">{t("automatedResponse.heading")}</h4>
        <Button size={"sm"} asChild>
          <Link href={`/chatbots/${chatbotId}/automated-responses/create`}>
            <PlusIcon />
            {t("common.createBtn")}
          </Link>
        </Button>
      </div>

      <AutomatedResponsesTable promises={promises} chatbotId={chatbotId} />
    </>
  )
}
