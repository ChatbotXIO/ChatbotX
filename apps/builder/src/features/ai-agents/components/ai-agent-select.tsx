"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { useAIAgentSelectOptions, useAIAgents } from "../hooks/use-ai-agents"

type AIAgentSelectProps = {
  name: string
  required?: boolean
}

export function AIAgentSelect(props: AIAgentSelectProps) {
  const t = useTranslations()

  const workspaceId = useWorkspaceId()
  const { isPending } = useAIAgents(workspaceId)
  const options = useAIAgentSelectOptions(workspaceId)

  return (
    <SelectField
      disabled={isPending}
      label={t("fields.aiAgent.label")}
      options={options}
      {...props}
    />
  )
}
