"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"
import { BaseStepEditor } from "../../base/editor"
import { AIModelDialog } from "../ai-model-dialog"
import { AIModelFormFields } from "../ai-model-form-fields"
import { useAIModelForm } from "../use-ai-model-form"
import type { AIProviderConfig } from "./config"

type GenerateTextEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
  provider: "claude" | "openai" | "gemini" | "deepseek"
  config: AIProviderConfig
  ModelSelectComponent: React.ComponentType<{ name: string }>
}

export const GenerateTextEditor = (props: GenerateTextEditorProps) => {
  const { parentName, flowVersion, provider, config, ModelSelectComponent } =
    props
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { form, onSubmit } = useAIModelForm({ parentName, flowVersion })

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
            <AIModelFormFields modelSelectComponent={ModelSelectComponent} />
          </AIModelDialog>
        </Form>
      </div>
    </BaseStepEditor>
  )
}

