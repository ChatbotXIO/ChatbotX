import { CreateBroadcastForm } from "@/features/broadcasts/create-broadcast-form"
import { listCustomFields } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/list-custom-fields.schema"
import { listFlowVersions } from "@/features/flow-versions/queries/list-flow-versions"
import { getTags } from "@/features/tags/queries"
import { getTagsSearchParamsCache } from "@/features/tags/schemas/get-tags-schema"

export default async function CreateBroadcastPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  const promises = Promise.all([
    listCustomFields({
      chatbotId,
      ...listCustomFieldsSearchParams.parse({}),
    }),
    listFlowVersions({
      where: {
        chatbotId,
        isLatest: true,
      },
    }),
    getTags({
      chatbotId,
      ...getTagsSearchParamsCache.parse({}),
    }),
  ])

  return <CreateBroadcastForm chatbotId={chatbotId} promises={promises} />
}
