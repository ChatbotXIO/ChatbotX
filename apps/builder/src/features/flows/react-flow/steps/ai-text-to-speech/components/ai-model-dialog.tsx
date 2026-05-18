"use client"

import { openAITTSVoiceTypes } from "@chatbotx.io/ai"
import { aiTextToSpeechSchema } from "@chatbotx.io/flow-config"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"

type AIModelDialogProps = {
  parentName: string
}

export const AIModelDialog = ({ parentName }: AIModelDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { getValues: getParentValues, setValue: setParentValue } =
    useFormContext()

  const form = useForm({
    resolver: zodResolver(aiTextToSpeechSchema),
    defaultValues: getParentValues(parentName),
  })

  useEffect(() => {
    if (!open) {
      return
    }

    form.reset(getParentValues(parentName))
  }, [form, getParentValues, open, parentName])

  const voiceTypeOptions = useMemo(
    () =>
      openAITTSVoiceTypes.options.map((voiceType) => ({
        label: voiceType,
        value: voiceType,
      })),
    [],
  )

  const handleSubmit = form.handleSubmit((values) => {
    const currentValues = getParentValues(parentName)
    setParentValue(parentName, {
      ...currentValues,
      ...values,
      provider: "openai",
    })
    setOpen(false)
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
            {t("fields.flows.aiTextToSpeech", {
              aiName: t("aiProviders.openai"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-6" onSubmit={handleSubmit}>
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-6 overflow-y-auto">
              <TiptapEditorField
                label={t("fields.inputText.label")}
                name="message"
                required
              />

              <SelectField
                label={t("fields.voiceType.label")}
                name="voiceType"
                options={voiceTypeOptions}
                placeholder={t("fields.voiceType.placeholder")}
                required
              />

              <InputField
                label={t("fields.voiceTone.label")}
                name="voiceTone"
                placeholder={t("fields.voiceTone.placeholder")}
              />

              <CustomFieldSelect
                allowCreate={true}
                includeReserved={false}
                label={t("fields.outputFieldId.label")}
                name="outputFieldId"
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
