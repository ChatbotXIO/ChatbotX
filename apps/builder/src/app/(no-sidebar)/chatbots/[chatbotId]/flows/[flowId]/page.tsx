import { db } from "@aha.chat/database/client"
import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { FlowDetail } from "@/features/flows/flow-detail"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

type FlowPageProps = {
  params: Promise<{ chatbotId: string; flowId: string }>
}

export default async function FlowPage({ params }: FlowPageProps) {
  const { chatbotId: chatbotIdString, flowId: flowIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }
  const flowId = parseBigIntId(flowIdString)
  if (!flowId) {
    return notFound()
  }

  const userAndChatbot = await getCurrentUserAndTargetChatbot(chatbotId)
  if (!userAndChatbot) {
    return notFound()
  }

  const flow = await db.query.flowModel.findFirst({
    where: {
      id: flowId,
      chatbotId,
    },
    with: {
      flowVersions: true,
    },
  })
  if (!flow) {
    return notFound()
  }

  const draftFlowVersion = flow.flowVersions?.find((v) => v.isDraft)
  if (!draftFlowVersion) {
    return notFound()
  }

  const organization = await db.query.organizationModel.findFirst({
    where: {
      id: userAndChatbot.targetChatbot.organizationId,
    },
  })
  if (!organization) {
    return notFound()
  }

  return (
    <div className="flex h-screen w-screen flex-col">
      <FlowDetail
        flow={flow}
        flowVersion={draftFlowVersion as FlowVersionResource}
        organization={organization}
      />
    </div>
  )
}
