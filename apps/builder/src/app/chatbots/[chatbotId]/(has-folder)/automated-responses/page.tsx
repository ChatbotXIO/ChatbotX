import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AutomatedResponsesTable } from "@/features/automated-response/automated-response-table"
import { AddAutomatedResponseButton } from "@/features/automated-response/components/add-automated-response-button"
import { getAutomatedResponses } from "@/features/automated-response/queries"
import { listAutomatedResponsesSearchParams } from "@/features/automated-response/schemas/get-automated-responses-schema"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"

export default async function AutomatedResponesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = listAutomatedResponsesSearchParams.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    getAutomatedResponses({
      ...search,
      chatbotId,
    }),
  ])
  const flowPromises = Promise.all([
    getFlows({
      chatbotId,
      ...listFlowsSearchParams.parse({
        active: "1",
        perPage: "1000",
      }),
    }),
  ])

  return (
    <>
      <div className="flex items-center">
        <h4 className="flex-1 font-bold">
          {t("automatedResponse.heading.title")}
        </h4>
        <AddAutomatedResponseButton />
      </div>

      <Suspense>
        <AutomatedResponsesTable
          chatbotId={chatbotId}
          flowPromises={flowPromises}
          promises={promises}
        />
      </Suspense>
    </>
  )
}
