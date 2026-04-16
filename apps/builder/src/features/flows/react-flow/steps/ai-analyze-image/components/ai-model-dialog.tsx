"use client"

import { aiAnalyzeImageSchema } from "@chatbotx.io/flow-config"
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
import { useEffect, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { AIModelSelect } from "./ai-model-select"

type AIModelDialogProps = {
  parentName: string
}

export const AIModelDialog = ({ parentName }: AIModelDialogProps) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const {
    control,
    getValues: getParentValues,
    setValue: setParentValue,
  } = useFormContext()
  const provider = useWatch({ name: `${parentName}.provider`, control })

  const form = useForm({
    resolver: zodResolver(aiAnalyzeImageSchema),
    defaultValues: getParentValues(parentName),
  })

  useEffect(() => {
    if (!open) {
      return
    }
    form.reset(getParentValues(parentName))
  }, [open, parentName, form, getParentValues])

  const handleSubmit = form.handleSubmit((values) => {
    const currentValues = getParentValues(parentName)

    setParentValue(parentName, {
      ...currentValues,
      ...values,
      provider: provider ?? currentValues.provider,
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
            {t("fields.flows.aiAnalyzeImage", {
              aiName: t(`aiProviders.${provider}`),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-6" onSubmit={handleSubmit}>
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-6 overflow-y-auto">
              <AIModelSelect name="model" provider={provider} required />

              <CustomFieldSelect
                includeReserved={false}
                label={t("fields.image.label")}
                name="inputFieldId"
                required
              />

              <TiptapEditorField
                label={t("fields.prompt.label")}
                name="prompt"
                placeholder={t("fields.prompt.placeholder")}
                required
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
