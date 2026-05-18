"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useAIAgentStore } from "../provider/ai-agent-store-context"

type AIAgentSelectProps = {
  name: string
  required?: boolean
}

export function AIAgentSelect(props: AIAgentSelectProps) {
  const t = useTranslations()

  const aiAgents = useAIAgentStore((state) => state.aiAgents)
  const loading = useAIAgentStore((state) => state.loading)

  const options =
    aiAgents.map((agent) => ({
      value: agent.id as string,
      label: agent.name as string,
    })) ?? []

  return (
    <SelectField
      disabled={loading}
      label={t("fields.aiAgent.label")}
      options={options}
      {...props}
    />
  )
}
