import { notFound } from "next/navigation"
import { findChatbot } from "@/features/chatbot/queries"
import { FlowDetail } from "@/features/flows/flow-detail"
import { findFlow } from "@/features/flows/queries"
import { findOrganization } from "@/features/organization/queries"

export default async function FlowPage(props: {
  params: Promise<{ chatbotId: string; flowId: string }>
}) {
  const params = await props.params
  const flowResult = await findFlow({
    id: params.flowId,
    chatbotId: params.chatbotId,
  })

  if (!flowResult.data) {
    return notFound()
  }

  const targetFlowVersion = flowResult.data.flowVersions?.find((v) => v.isDraft)
  if (!targetFlowVersion) {
    return null
  }

  const chatbot = await findChatbot({
    id: params.chatbotId,
  })

  const organization = await findOrganization({
    id: chatbot.organizationId,
  })
  if (!organization) {
    return notFound()
  }

  return (
    <FlowDetail
      flow={flowResult.data}
      flowVersion={targetFlowVersion}
      organization={organization}
    />
  )
}
