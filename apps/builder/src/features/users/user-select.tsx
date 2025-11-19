"use client"

import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { callAPI } from "@/lib/swr"
import type { ChatbotMemberCollection } from "../chatbot-members/schemas"

type UserSelectProps = {
  name: string
  label?: string
  required?: boolean
  className?: string
}

export function UserSelect(props: UserSelectProps) {
  const t = useTranslations()
  const { name, label, required = false, className } = props

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
      label={label}
      name={name}
      options={userOptions}
      placeholder={t("fields.user.selectAgent")}
      required={required}
    />
  )
}

export const UserMultipleSelect = (props: UserSelectProps) => {
  const t = useTranslations()
  const { name, label, required = false, className } = props

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
      label={label}
      name={name}
      options={userOptions}
      placeholder={t("fields.user.selectAgents")}
      required={required}
    />
  )
}
