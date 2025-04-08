import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { callAPI } from "@/lib/swr"
import {
  WhatsappFlowStatus,
  type WhatsappFlow,
} from "@ahachat.ai/database/browser"
import { useParams } from "next/navigation"

export const FlowSelect = ({
  name,
  label,
  isRequired = false,
}: {
  name: string
  label: string
  isRequired?: boolean
}) => {
  const params = useParams<{ chatbotId: string }>()

  const url = `/api/chatbots/${params.chatbotId}/whatsapp/flows?perPage=9999&status=${WhatsappFlowStatus.PUBLISHED}`
  const { data } = callAPI(url)
  const flows = ((data as { data: WhatsappFlow[] })?.data ?? []).map((v) => ({
    label: v.name,
    value: v.sourceId,
  }))

  return (
    <FormInput name={name} label={label} isRequired={isRequired}>
      <SingleSelect name={name} placeholder="Please select" options={flows} />
    </FormInput>
  )
}
