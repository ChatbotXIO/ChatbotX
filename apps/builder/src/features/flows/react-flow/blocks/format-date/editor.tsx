"use client"

import { FormInput } from "@/components/form-input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { FormatTimezoneSelect } from "@/features/flows/react-flow/blocks/format-date/format-timezone-select"
import {
  type FormatDateSchema,
  formatDateSchema,
} from "@/features/flows/react-flow/blocks/format-date/schema"
import { CustomFieldType } from "@ahachat.ai/database"
import { zodResolver } from "@hookform/resolvers/zod"
import { T, useTranslate } from "@tolgee/react"
import { ZapIcon } from "lucide-react"
import React from "react"
import { useForm, useFormContext } from "react-hook-form"

interface formatDateEditorProps {
  parentName: string
}

export const FormatDateEditor = ({ parentName }: formatDateEditorProps) => {
  const { t } = useTranslate()
  const [open, setOpen] = React.useState(false)

  const { setValue: setValueOriginEditor, getValues: getValuesOriginEditor } =
    useFormContext()
  const schema: FormatDateSchema = getValuesOriginEditor(parentName)

  const form = useForm<FormatDateSchema>({
    resolver: zodResolver(formatDateSchema),
    defaultValues: schema,
    mode: "onChange",
  })

  const { getValues, formState } = form

  const onSave = () => {
    setValueOriginEditor(parentName, getValues())
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex flex-col items-center rounded-md bg-slate-200 p-2 border-2 border-transparent transition-all ease-in hover:border-blue-500 hover:cursor-pointer hover:shadow-xl">
          <div className="flex items-center justify-center gap-2">
            <ZapIcon size={20} className="text-yellow-500" />
            <T keyName="flows.ActionType.FormatDate" />
          </div>
        </div>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="capitalize">
            {t("flows.ActionType.FormatDate")}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <div className="flex flex-col gap-4">
            <CustomFieldSelect
              name="fromCustomFieldId"
              label={t("flows.FormatDate.DatetimeCustomField")}
              customFieldType={[CustomFieldType.DATE, CustomFieldType.DATETIME]}
            />

            <FormInput name="format" label={<T keyName={"common.format"} />} />

            <CustomFieldSelect
              name="customFieldId"
              label="Save response to a custom field"
              customFieldType={[
                CustomFieldType.SHORTTEXT,
                CustomFieldType.NUMBER,
              ]}
              allowCreate={true}
            />

            <FormatTimezoneSelect name="formatTimezone" />
          </div>
        </Form>

        <DialogFooter className="flex items-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="sm">
              <T keyName="common.cancelBtn" />
            </Button>
          </DialogClose>

          <Button
            type="button"
            size="sm"
            disabled={!formState.isValid}
            onClick={onSave}
          >
            <T keyName="common.save" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
