"use client"

import { AIGenerateImageProvider } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { BaseStepEditor } from "../base/editor"
import { AIModelDialog } from "./ai-model-dialog"
import { AIModelFormFields } from "./ai-model-form-fields"
import { AI_PROVIDER_CONFIGS } from "./config"
import { ModelSelect } from "./model-select"
import { useAIModelForm } from "./use-ai-model-form"

type AIGenerateImageEditorProps = {
  parentName: string
}

const AIGenerateImageEditor = (props: AIGenerateImageEditorProps) => {
  const { parentName } = props
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { form, onSubmit } = useAIModelForm({ parentName })

  const provider = form.watch("provider") || AIGenerateImageProvider.OPENAI
  const config =
    AI_PROVIDER_CONFIGS[provider as keyof typeof AI_PROVIDER_CONFIGS] ||
    AI_PROVIDER_CONFIGS[AIGenerateImageProvider.OPENAI]

  const handleSubmit = () => {
    onSubmit()
    setOpen(false)
  }

  return (
    <BaseStepEditor
      icon={config.icon}
      title={t("fields.flows.aiGenerateImage.label", {
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
            name={t("actions.generateImage")}
            onOpenChange={(val: boolean) => setOpen(val)}
            onSubmit={() => {
              form.handleSubmit(handleSubmit)()
            }}
            open={open}
            showTrigger={false}
          >
            <AIModelFormFields
              modelSelectComponent={(modelSelectProps) => (
                <ModelSelect {...modelSelectProps} />
              )}
            />
          </AIModelDialog>
        </Form>
      </div>
    </BaseStepEditor>
  )
}

export default AIGenerateImageEditor
