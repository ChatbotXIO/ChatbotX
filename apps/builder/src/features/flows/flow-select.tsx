import { SelectField } from "@/components/form/select-field"
import { callAPI } from "@/lib/swr"
import { useParams } from "next/navigation"
import type { FlowCollection } from "./schemas/get-flows-schema"

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

  const custormFieldsUrl = `/api/chatbots/${params.chatbotId}/flows?perPage=9999`
  const { data } = callAPI<FlowCollection>(custormFieldsUrl)

  const flowOptions = (data?.data || []).map((v) => ({
    label: v.name,
    value: v.id,
  }))

  return (
    <SelectField
      name={name}
      label={label}
      isRequired={isRequired}
      placeholder="Please select"
      options={flowOptions}
    />
  )
}
