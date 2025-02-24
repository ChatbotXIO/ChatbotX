import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { callAPI } from "@/lib/swr"
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

  const custormFieldsUrl = `/api/chatbots/${params.chatbotId}/flows?perPage=9999`
  const { data } = callAPI(custormFieldsUrl)
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const flows = ((data as { data: any[] })?.data ?? []).map((v) => ({
    label: v.name,
    value: v.id,
  }))

  return (
    <FormInput name={name} label={label} isRequired={isRequired}>
      <SingleSelect name={name} placeholder="Please select" options={flows} />
    </FormInput>
  )
}
