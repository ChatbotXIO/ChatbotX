import { SelectField } from "@/components/form/select-field"
import { callAPI } from "@/lib/swr"
import { useParams } from "next/navigation"
import { OMNICHANNEL } from "@ahachat.ai/database/types"
import type { InboxCollection } from "./schemas"

export function InboxSelect({ name }: { name: string }) {
  const params = useParams<{ chatbotId: string }>()

  const api = `/api/chatbots/${params.chatbotId}/inboxes?perPage=9999`
  const { data } = callAPI<InboxCollection>(api)

  const inboxes: { label: string; value: string }[] = (data?.data ?? []).map(
    (v) => ({
      label: v.inboxType,
      value: v.id,
    }),
  )
  inboxes.unshift({ label: "Omnichannel", value: OMNICHANNEL })

  return (
    <SelectField
      name={name}
      label="Message Type"
      placeholder="Please select"
      options={inboxes}
    />
  )
}
