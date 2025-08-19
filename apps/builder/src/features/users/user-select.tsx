import {
  MultiSelectField,
  SelectField,
} from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { callAPI } from "@/lib/swr"
import type { ChatbotMemberCollection } from "../chatbot-members/schemas"

type UserSelectProps = {
  name: string
  label?: string
  isRequired?: boolean
  className?: string
}

export const UserSelect = (props: UserSelectProps) => {
  const { name, label, isRequired = false, className } = props

  const params = useParams<{ chatbotId: string }>()

  const usersUrl = `/api/chatbots/${params.chatbotId}/agents?perPage=9999`
  const { data } = callAPI<ChatbotMemberCollection>(usersUrl)
  const userOptions = (data?.data ?? []).map((v) => ({
    label: v.user?.name ?? v.user?.email ?? "",
    value: v.user?.id ?? "",
  }))

  return (
    <SelectField
      className={className}
      isRequired={isRequired}
      label={label}
      name={name}
      options={userOptions}
      placeholder="Please select agent"
    />
  )
}

export const UserMultipleSelect = (props: UserSelectProps) => {
  const { name, label, isRequired = false, className } = props

  const params = useParams<{ chatbotId: string }>()

  const usersUrl = `/api/chatbots/${params.chatbotId}/agents?perPage=9999`
  const { data } = callAPI<ChatbotMemberCollection>(usersUrl)
  const userOptions = (data?.data ?? []).map((v) => ({
    label: v.user?.name ?? v.user?.email ?? "",
    value: v.user?.id ?? "",
  }))

  return (
    <MultiSelectField
      className={className}
      isRequired={isRequired}
      label={label}
      name={name}
      options={userOptions}
      placeholder="Please select agents"
    />
  )
}
