import { EditAutomatedResponseForm } from "@/features/automated-response/automated-response-form"
import {
  getActiveFlows,
  showAutomatedResponses,
} from "@/features/automated-response/queries"
import type { SearchParams } from "nuqs"

export default async function EditAutomatedResponsePage(props: {
  params: Promise<{ chatbotId: string; automatedResponseId: string }>
  searchParams: Promise<SearchParams>
}) {
  const [params, queryParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])

  const [result, flows] = await Promise.all([
    showAutomatedResponses({
      id: params.automatedResponseId,
    }),
    getActiveFlows({
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <EditAutomatedResponseForm
      chatbotId={params.chatbotId}
      data={result}
      flows={flows.data}
    />
  )
}
