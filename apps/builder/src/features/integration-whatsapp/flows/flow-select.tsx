import { SelectField } from "@/components/form/select-field"
import { callAPI } from "@/lib/swr"
import {
  WhatsappFlowStatus,
  type WhatsappFlowModel,
} from "@aha.chat/database/types"
import { useParams } from "next/navigation"

export const WhatsappFlowSelect = ({
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
  const { data } = callAPI<{ data: WhatsappFlowModel[] }>(url)
  const flows = (data?.data ?? []).map((v) => ({
    label: v.name,
    value: v.sourceId,
  }))

  return (
    <SelectField
      name={name}
      label={label}
      isRequired={isRequired}
      placeholder="Please select"
      options={flows}
    />
  )
}
