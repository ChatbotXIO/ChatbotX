"use client"

import { aiSpeechToTextSchema } from "@chatbotx.io/flow-config"
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
import { useForm, useFormContext } from "react-hook-form"
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
    resolver: zodResolver(aiSpeechToTextSchema),
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
            {t("fields.flows.aiSpeechToText", {
              aiName: t("aiProviders.openai"),
            })}
          </DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-col space-y-6" onSubmit={handleSubmit}>
            <div className="flex max-h-[calc(100vh-200px)] flex-col space-y-6 overflow-y-auto">
              <CustomFieldSelect
                includeReserved={false}
                label={t("fields.audio.label")}
                name="inputFieldId"
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
