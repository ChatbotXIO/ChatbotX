"use client"

import { InputField } from "@/components/form/input-field"
import { SelectField } from "@/components/form/select-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import {
  formatDateStepSchema,
  FormatTimezone,
  type FormatDateStepSchema,
} from "@ahachat.ai/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import { T } from "@tolgee/react"
import { ZapIcon } from "lucide-react"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"

export default function FormatDateStepEditor({
  parentName,
}: { parentName: string }) {
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button variant="outline" size="sm">
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
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col w-full gap-4"
          >
            <CustomFieldSelect
              name="inputCustomFieldId"
              label="Date & Time Custom field"
              isRequired
            />

            <InputField name="format" label="Format" isRequired />

            <CustomFieldSelect
              name="outputCustomFieldId"
              label="Save to custom field"
              isRequired
              allowCreate={true}
            />

            <SelectField
              name="timezone"
              label="Timezone"
              options={[
                { label: "Contact Timezone", value: FormatTimezone.CONTACT },
                { label: "Account Timezone", value: FormatTimezone.ACCOUNT },
              ]}
              isRequired
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>

              <Button
                type="submit"
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
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
