"use client"

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
import { T } from "@tolgee/react"
import { ZapIcon } from "lucide-react"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

export default function FormatDateStepEditor({
  parentName,
}: {
  parentName: string
}) {
  return (
    <BaseStepEditor
      icon={ZapIcon}
      title={<T keyName="flows.StepType.FormatDate" />}
    >
      <FormatDateDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function FormatDateDialog({ parentName }: { parentName: string }) {
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
    setValue(`${parentName}.inputCustomFieldId`, data.inputCustomFieldId)
    setValue(`${parentName}.format`, data.format)
    setValue(`${parentName}.outputCustomFieldId`, data.outputCustomFieldId)
    setValue(`${parentName}.timezone`, data.timezone)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" variant="outline">
            Edit
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Format date</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <CustomFieldSelect
              isRequired
              label="Date & Time Custom field"
              name="inputCustomFieldId"
            />

            <InputField isRequired label="Format" name="format" />

            <CustomFieldSelect
              allowCreate={true}
              isRequired
              label="Save to custom field"
              name="outputCustomFieldId"
            />

            <SelectField
              isRequired
              label="Timezone"
              name="timezone"
              options={[
                { label: "Contact Timezone", value: FormatTimezone.CONTACT },
                { label: "Account Timezone", value: FormatTimezone.ACCOUNT },
              ]}
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
