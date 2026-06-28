"use client"

import type { SetMessengerPersonaStepSchema } from "@chatbotx.io/flow-config"
import { UserIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFlowTemplate } from "../../stores/flow-template-store-provider"
import { BaseStepViewer } from "../base/viewer"

const SetMessengerPersonaStepViewer = ({
  data,
}: {
  data: SetMessengerPersonaStepSchema
}) => {
  const t = useTranslations()
  const personas = useFlowTemplate((s) => s.messengerPersonas)

  const selected = data.personaId
    ? personas.find((persona) => persona.id === data.personaId)
    : undefined

  const label = selected?.name ?? t("fields.persona.pageDefault")

  return (
    <BaseStepViewer
      icon={UserIcon}
      title={t("flows.actions.setMessengerPersona")}
    >
      <span className="text-muted-foreground">{label}</span>
    </BaseStepViewer>
  )
}

export default SetMessengerPersonaStepViewer
