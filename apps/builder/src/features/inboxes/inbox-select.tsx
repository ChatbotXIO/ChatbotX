import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { callAPI } from "@/lib/swr"
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
  inboxes.unshift({ label: "Omnichannel", value: "omnichannel" })

  return (
    <SelectField
      label="Message Type"
      name={name}
      options={inboxes}
      placeholder="Please select"
      required
    />
  )
}
