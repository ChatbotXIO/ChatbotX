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
  generateCodeStepSchema,
  type GenerateCodeStepSchema,
  GenerateCodeType,
} from "@ahachat.ai/flow-config"
import { zodResolver } from "@hookform/resolvers/zod"
import { T } from "@tolgee/react"
import { ShuffleIcon } from "lucide-react"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"

export default function GenerateCodeStepEditor({
  parentName,
}: { parentName: string }) {
  return (
    <BaseStepEditor
      icon={ShuffleIcon}
      title={<T keyName="flows.StepType.GenerateCode" />}
    >
      <GenerateCodeDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function GenerateCodeDialog({ parentName }: { parentName: string }) {
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<GenerateCodeStepSchema>({
    resolver: zodResolver(generateCodeStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const onSubmit = (data: GenerateCodeStepSchema) => {
    setValue(`${parentName}.type`, data.type)
    setValue(`${parentName}.min`, data.min)
    setValue(`${parentName}.max`, data.max)
    setValue(`${parentName}.outputCustomFieldId`, data.outputCustomFieldId)
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
          <DialogTitle>Generate code</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col w-full gap-4"
          >
            <SelectField
              name="type"
              label="Type"
              options={[
                {
                  label: "Numeric (Minimum/Maximum length)",
                  value: GenerateCodeType.NUMERIC_LENGTH,
                },
                {
                  label: "Numeric (Minimum/Maximum number)",
                  value: GenerateCodeType.NUMERIC_VALUE,
                },
                {
                  label: "Alphanumeric (Minimum/Maximum length)",
                  value: GenerateCodeType.ALPHANUMERIC_LENGTH,
                },
              ]}
              isRequired
            />

            <InputField name="min" label="Min" isRequired />

            <InputField name="max" label="Max" isRequired />

            <CustomFieldSelect
              name="outputCustomFieldId"
              label="Save to custom field"
              isRequired
              allowCreate={true}
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
