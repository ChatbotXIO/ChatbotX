"use client"

import { aiGenerateImageSchema } from "@aha.chat/flow-config"
import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { useAIToolOptions } from "@/features/ai-triggers/use-ai-tools"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { AIModelSelect } from "./ai-model-select"

type AIModelDialogProps = {
  parentName: string
}

export const AIModelDialog = ({ parentName }: AIModelDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const toolOptions = useAIToolOptions()

  const { getValues, control } = useFormContext()
  const provider = useWatch({ name: `${parentName}.provider`, control })

  const form = useForm({
    resolver: zodResolver(aiGenerateImageSchema),
    defaultValues: getValues(parentName),
  })

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {t("actions.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("fields.flows.aiGenerateText.label", {
              aiName: "OpenAI",
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-4">
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-4 overflow-y-auto">
              <AIModelSelect name="model" provider={provider} required />

              <TiptapEditorField
                label={t("fields.prompt.label")}
                name="prompt"
                placeholder={t("fields.prompt.placeholder")}
              />

              <TiptapEditorField
                label={t("fields.userMessage.label")}
                name="text"
                required
              />

              <CustomFieldSelect
                allowCreate={true}
                includeReserved={true}
                label={t("fields.outputCfId.label")}
                name="outputCfId"
                required
              />

              <MultiSelectField
                label={t("fields.tools.label")}
                name="tools"
                options={toolOptions}
              />

              <CheckboxGroupField
                name="rememberConversation"
                options={[
                  { value: "1", label: t("fields.rememberConversation.label") },
                ]}
              />

              <InputNumberField
                label={t("fields.temperature.label")}
                max={2}
                min={0}
                name="temperature"
                required
                stepper={0.1}
              />

              <InputNumberField
                label={t("fields.maxOutputTokens.label")}
                max={4096}
                min={250}
                name="maxOutputTokens"
                required
                stepper={1}
              />
            </div>

            <DialogFooter className="flex items-end">
              <DialogClose asChild>
                <Button size="sm" type="button" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>
              <Button size="sm" type="submit">
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
