import { notFound } from "next/navigation"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { listFlowVersions } from "@/features/flow-versions/queries/list-flow-versions"
import { FlowDetail } from "@/features/flows/flow-detail"
import { findFlow } from "@/features/flows/queries"
import { getTags } from "@/features/tags/queries"
import { getTagsSearchParamsCache } from "@/features/tags/schemas/get-tags-schema"

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

  const promises = Promise.all([
    listCustomFields({
      chatbotId: params.chatbotId,
      ...listCustomFieldsSearchParams.parse({}),
    }),
    listFlowVersions({
      where: {
        chatbotId: params.chatbotId,
        isLatest: true,
      },
    }),
    getTags({
      chatbotId: params.chatbotId,
      ...getTagsSearchParamsCache.parse({}),
    }),
  ])

  return (
    <FlowDetail
      flow={flowResult.data}
      flowVersion={targetFlowVersion}
      promises={promises}
    />
  )
}
