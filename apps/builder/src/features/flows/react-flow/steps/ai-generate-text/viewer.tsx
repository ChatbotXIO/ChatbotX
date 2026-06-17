"use client"

import type { AIGenerateTextSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { StateHandle } from "../base/step-state-handles"
import { AIIcon } from "./components/ai-icon"

type AIGenerateTextViewerProps = {
  data: AIGenerateTextSchema
}

export const AIGenerateTextViewer = (props: AIGenerateTextViewerProps) => {
  const { data } = props
  const t = useTranslations()

  const successState = data.states?.find((s) => s.stateType === "success")
  const errorState = data.states?.find((s) => s.stateType === "error")

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex w-full items-center justify-center gap-2 text-center font-bold">
        <AIIcon
          label={t("fields.flows.aiGenerateText", {
            aiName: t(`aiProviders.${data.provider}`),
          })}
          provider={data.provider}
        />
      </div>

      <div className="flex flex-col items-end gap-2">
        {successState && (
          <StateHandle
            borderClass="border-green-500"
            fillClass="bg-green-500"
            label={t("messages.success")}
            stateId={successState.id}
          />
        )}
        {errorState && (
          <StateHandle
            borderClass="border-red-500"
            fillClass="bg-red-500"
            label={t("messages.failed")}
            stateId={errorState.id}
          />
        )}
      </div>
    </div>
  )
}
