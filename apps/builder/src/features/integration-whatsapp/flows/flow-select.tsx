import {
  type WhatsappFlowModel,
  WhatsappFlowStatus,
} from "@aha.chat/database/types"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { callAPI } from "@/lib/swr"

type WhatsappFlowSelectProps = {
  name: string
  label: string
  isRequired?: boolean
}

export const WhatsappFlowSelect = (props: WhatsappFlowSelectProps) => {
  const { name, label, isRequired } = props

  const params = useParams<{ chatbotId: string }>()

  const url = `/api/chatbots/${params.chatbotId}/whatsapp/flows?perPage=9999&status=${WhatsappFlowStatus.PUBLISHED}`
  const { data } = callAPI<{ data: WhatsappFlowModel[] }>(url)
  const flows = (data?.data ?? []).map((v) => ({
    label: v.name,
    value: v.sourceId,
  }))

  return (
    <SelectField
      isRequired={isRequired}
      label={label}
      name={name}
      options={flows}
      placeholder="Please select"
    />
  )
}
