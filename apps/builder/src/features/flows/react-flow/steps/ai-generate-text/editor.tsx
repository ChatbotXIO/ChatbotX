"use client"

import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./ai-model-dialog"
import { AIModelFormFields } from "./ai-model-form-fields"
import { AI_PROVIDER_CONFIGS } from "./config"
import { ModelSelect } from "./model-select"
import { useAIModelForm } from "./use-ai-model-form"

type AIGenerateTextEditorProps = {
  parentName: string
}

export const AIGenerateTextEditor = (props: AIGenerateTextEditorProps) => {
  const { parentName } = props
  const t = useTranslations()
  const { getValues } = useFormContext()
  const [open, setOpen] = useState(false)
  const { form, onSubmit } = useAIModelForm({ parentName })

  // Read provider from form data
  const stepData = getValues(parentName) as AIGenerateTextSchema | undefined
  const provider = (stepData?.provider || "openai") as
    | "claude"
    | "openai"
    | "gemini"
    | "deepseek"
  const config = AI_PROVIDER_CONFIGS[provider]

  const handleSubmit = () => {
    onSubmit()
    setOpen(false)
  }

  return (
    <BaseStepEditor
      icon={config.icon}
      title={t("fields.flows.aiGenerateText.label", {
        aiName: t(config.modelLabelKey),
      })}
    >
      <div>
        <div className="flex justify-center">
          <Button
            onClick={() => setOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("actions.update")}
          </Button>
        </div>

        <Form {...form}>
          <AIModelDialog
            icon={config.icon}
            iconColor={config.iconColor}
            modelLabel={t(config.modelLabelKey)}
            name={t("actions.generateText")}
            onOpenChange={(val: boolean) => setOpen(val)}
            onSubmit={() => {
              form.handleSubmit(handleSubmit)()
            }}
            open={open}
            showTrigger={false}
          >
            <AIModelFormFields
              modelSelectComponent={(modelSelectProps) => (
                <ModelSelect {...modelSelectProps} provider={provider} />
              )}
            />
          </AIModelDialog>
        </Form>
      </div>
    </BaseStepEditor>
  )
}
