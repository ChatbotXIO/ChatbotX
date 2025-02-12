import { getFields } from "@/features/fields/queries"
import { getCurrentFlow } from "@/features/flows/queries"
import { ReactFlowFrame } from "@/features/flows/react-flow/frame"
import { CustomFieldType, FieldType } from "@ahachat.ai/database"

export default async function FlowPage(props: {
  params: Promise<{ chatbotId: string; flowId: string }>
}) {
  const params = await props.params
  const promise = Promise.all([
    getCurrentFlow({
      id: params.flowId,
      chatbotId: params.chatbotId,
    }),
    getFields({
      chatbotId: params.chatbotId,
      folderId: undefined,
      perPage: 500,
      fieldType: FieldType.CustomField,
      customFieldType: CustomFieldType.DateTime,
      name: "",
      sort: [{ id: "createdAt", desc: true }],
      page: 1,
    }),
  ])

  return (
    <>
      <ReactFlowFrame promises={promise} />
    </>
  )
}
