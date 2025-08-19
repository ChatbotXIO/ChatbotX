"use client"

import type { SetCustomFieldStepSchema } from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aha.chat/ui/components/ui/dialog"
import { Form } from "@aha.chat/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { T } from "@tolgee/react"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { setCustomFieldStep } from "."

const SetCustomFieldStepEditor = ({ parentName }: { parentName: string }) => {
  const { setValue, getValues } = useFormContext()
  const defaultValue: SetCustomFieldStepSchema = getValues(parentName)

  const [open, setOpen] = useState<boolean>(false)
  const operations = [
    { label: "Set to", value: "set" },
    { label: "Append to the end", value: "append" },
    { label: "Prepend to the start", value: "prepend" },
  ]

  const customFieldForm = useForm<SetCustomFieldStepSchema>({
    resolver: zodResolver(setCustomFieldStep.validator),
    defaultValues: defaultValue ?? setCustomFieldStep.defaultFn(),
  })

  function onSubmit(values: SetCustomFieldStepSchema) {
    setValue(`${parentName}.customFieldId`, values.customFieldId)
    setValue(`${parentName}.operation`, values.operation)
    setValue(`${parentName}.value`, values.value)

    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="rounded-lg border-2 border-dashed p-4 text-sm">
          <T keyName="flows.StepType.SetCustomField" />
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Field</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <Form {...customFieldForm}>
          <form
            className="flex flex-col gap-2"
            onSubmit={customFieldForm.handleSubmit(onSubmit)}
          >
            <CustomFieldSelect
              allowCreate={true}
              label="Custom Field"
              name="customFieldId"
            />
            <SelectField
              isRequired={true}
              label="Operation"
              name="operation"
              options={operations}
            />
            <InputField label="Value" name="value" />

            <div className="flex w-full items-center justify-center gap-2">
              <Button
                onClick={() => setOpen(false)}
                size={"sm"}
                type="button"
                variant={"link"}
              >
                <T keyName={"common.cancelBtn"} />
              </Button>
              <Button
                disabled={
                  !customFieldForm.formState.isValid ||
                  customFieldForm.formState.isSubmitting
                }
                size={"sm"}
              >
                <T keyName={"common.confirmBtn"} />
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export { SetCustomFieldStepEditor }
