"use client"

import {
  aiAnalyzeImageProviders,
  aiAnalyzeImageSchema,
} from "@aha.chat/flow-config"
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
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { AIModelSelect } from "../../ai-generate-text/components/ai-model-select"

type AIAnalyzeImageDialogProps = {
  parentName: string
}

export const AIAnalyzeImageDialog = ({
  parentName,
}: AIAnalyzeImageDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const { control, getValues, setValue } = useFormContext()
  const provider = useWatch({ name: `${parentName}.provider`, control })

  const form = useForm({
    resolver: zodResolver(aiAnalyzeImageSchema),
    defaultValues: getValues(parentName),
  })

  const handleSubmit = form.handleSubmit((values) => {
    const currentValues = getValues(parentName)

    setValue(
      parentName,
      {
        ...currentValues,
        ...values,
        provider: provider ?? currentValues.provider,
      },
      { shouldDirty: true, shouldTouch: true, shouldValidate: true },
    )

    setOpen(false)
  })

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          {t("actions.update")}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("fields.flows.aiAnalyzeImage.label", {
              name:
                {
                  [aiAnalyzeImageProviders.gemini]: "Gemini",
                  [aiAnalyzeImageProviders.claude]: "Claude",
                  [aiAnalyzeImageProviders.openai]: "OpenAI",
                }[provider as keyof typeof aiAnalyzeImageProviders] || "OpenAI",
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-4" onSubmit={handleSubmit}>
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-4 overflow-y-auto">
              <AIModelSelect name="model" provider={provider} required />

              <TiptapEditorField
                label={t("fields.imageUrl.label")}
                name="imageUrl"
                placeholder={t("fields.imageUrl.placeholder")}
                required
              />

              <TiptapEditorField
                label={t("fields.prompt.label")}
                name="prompt"
                placeholder={t("fields.prompt.placeholder")}
              />

              <CustomFieldSelect
                allowCreate={true}
                includeReserved={true}
                label={t("fields.outputCfId.label")}
                name="outputCfId"
                required
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
