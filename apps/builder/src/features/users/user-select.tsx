import { MultiSelectField, SelectField } from "@/components/form/select-field"
import { callAPI } from "@/lib/swr"
import { useParams } from "next/navigation"
import type { ChatbotMemberCollection } from "../chatbot-members/schemas"

export const UserSelect = ({
  name,
  label,
  isRequired = false,
  className,
}: {
  name: string
  label?: string
  isRequired?: boolean
  className?: string
}) => {
  const params = useParams<{ chatbotId: string }>()

  const usersUrl = `/api/chatbots/${params.chatbotId}/agents?perPage=9999`
  const { data } = callAPI<ChatbotMemberCollection>(usersUrl)
  const userOptions = (data?.data ?? []).map((v) => ({
    label: v.user?.name ?? v.user?.email ?? "",
    value: v.user?.id ?? "",
  }))

  return (
    <SelectField
      name={name}
      label={label}
      isRequired={isRequired}
      placeholder="Please select agent"
      options={userOptions}
      className={className}
    />
  )
}

export const UserMultipleSelect = ({
  name,
  label,
  isRequired = false,
  className,
}: {
  name: string
  label?: string
  isRequired?: boolean
  className?: string
}) => {
  const params = useParams<{ chatbotId: string }>()

  const usersUrl = `/api/chatbots/${params.chatbotId}/agents?perPage=9999`
  const { data } = callAPI<ChatbotMemberCollection>(usersUrl)
  const userOptions = (data?.data ?? []).map((v) => ({
    label: v.user?.name ?? v.user?.email ?? "",
    value: v.user?.id ?? "",
  }))

  return (
    <MultiSelectField
      name={name}
      label={label}
      isRequired={isRequired}
      placeholder="Please select agents"
      options={userOptions}
      className={className}
    />
  )
}
