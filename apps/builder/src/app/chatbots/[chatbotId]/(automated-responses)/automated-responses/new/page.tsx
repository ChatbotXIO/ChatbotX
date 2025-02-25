import { CreateAutomatedResponseForm } from "@/features/automated-response/automated-response-form"
import { getActiveFlows } from "@/features/automated-response/queries"
import type { SearchParams } from "nuqs/server"
import React from "react"

export default async function NewAutoResponsePage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const [params, queryParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])

  const [flows] = await Promise.all([
    getActiveFlows({
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <>
      <CreateAutomatedResponseForm
        chatbotId={params.chatbotId}
        folderId={(queryParams.folderId || null) as string}
        flows={flows.data}
      />
    </>
  )
}
