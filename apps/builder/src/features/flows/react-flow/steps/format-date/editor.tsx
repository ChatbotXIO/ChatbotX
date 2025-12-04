"use client"

import { CustomFieldType } from "@aha.chat/database/types"
import {
  type FormatDateStepSchema,
  FormatTimezone,
  formatDateStepSchema,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
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
import { ZapIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

const FormatDateStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={ZapIcon} title={t("flows.actions.formatDate")}>
      <FormatDateDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

const FormatDateDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<FormatDateStepSchema>({
    resolver: zodResolver(formatDateStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const onSubmit = (data: FormatDateStepSchema) => {
    setValue(`${parentName}.inputCfId`, data.inputCfId)
    setValue(`${parentName}.format`, data.format)
    setValue(`${parentName}.outputCfId`, data.outputCfId)
    setValue(`${parentName}.timezone`, data.timezone)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" variant="outline">
            {t("actions.update")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.formatDate")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <CustomFieldSelect
              customFieldTypes={[
                CustomFieldType.date,
                CustomFieldType.datetime,
              ]}
              label={t("fields.inputCustomField.label")}
              name="inputCfId"
              required
            />

            <InputField
              label={t("fields.format.label")}
              name="format"
              required
            />

            <CustomFieldSelect
              allowCreate={true}
              label={t("fields.outputCustomField.label")}
              name="outputCfId"
              required
            />

            <SelectField
              label={t("fields.timezone.label")}
              name="timezone"
              options={[
                {
                  label: t("flows.formatTimezone.contactTimezone"),
                  value: FormatTimezone.contact,
                },
                {
                  label: t("flows.formatTimezone.accountTimezone"),
                  value: FormatTimezone.chatbot,
                },
              ]}
              required
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("actions.cancel")}</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default FormatDateStepEditor
