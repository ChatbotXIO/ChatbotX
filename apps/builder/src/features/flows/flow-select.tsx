import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { callAPI } from "@/lib/swr"
import type { FlowCollection } from "./schemas/get-flows-schema"

type FlowSelectProps = {
  name: string
  label?: string
  isRequired?: boolean
  className?: string
}

export const FlowSelect = (props: FlowSelectProps) => {
  const { name, label, isRequired = false, className } = props

  const params = useParams<{ chatbotId: string }>()

  const flowUrl = `/api/chatbots/${params.chatbotId}/flows?perPage=9999`
  const { data } = callAPI<FlowCollection>(flowUrl)
  const flowOptions = (data?.data ?? []).map((v) => ({
    label: v.name,
    value: v.id,
  }))

  return (
    <SelectField
      className={className}
      isRequired={isRequired}
      label={label}
      name={name}
      options={flowOptions}
      placeholder="Please select flow"
    />
  )
}
