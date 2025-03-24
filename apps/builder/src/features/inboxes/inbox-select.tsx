import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { callAPI } from "@/lib/swr"
import { useParams } from "next/navigation"
import { useFormContext } from "react-hook-form"
import type { InboxCollection } from "./schemas/list-inboxes.schema"

export function InboxSelect({ name }: { name: string }) {
  const params = useParams<{ chatbotId: string }>()
  const { control } = useFormContext()

  const api = `/api/chatbots/${params.chatbotId}/inboxes?perPage=9999`
  const { data } = callAPI<InboxCollection>(api)

  const inboxes: { label: string; value: string }[] = (data?.data ?? []).map(
    (v) => ({
      label: v.inboxType,
      value: v.id,
    }),
  )
  inboxes.unshift({ label: "Omnichannel", value: "OMNICHANNEL" })

  return (
    <FormInput name={name} label="Message Type" {...control}>
      <SingleSelect name={name} placeholder="Please select" options={inboxes} />
    </FormInput>
  )
}
