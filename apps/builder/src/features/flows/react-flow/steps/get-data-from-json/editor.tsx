"use client"

import {
  type GetDataFromJsonStepSchema,
  getDataFromJsonStepSchema,
} from "@aha.chat/flow-config"
import { InputField } from "@aha.chat/ui/components/form/input-field"
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
import { Label } from "@aha.chat/ui/components/ui/label"
import { zodResolver } from "@hookform/resolvers/zod"
import { T } from "@tolgee/react"
import { ArrowRight, CodeIcon } from "lucide-react"
import { useState } from "react"
import { useFieldArray, useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

export default function GetDataFromJsonStepEditor({
  parentName,
}: {
  parentName: string
}) {
  return (
    <BaseStepEditor
      icon={CodeIcon}
      title={<T keyName="flows.StepType.GetDataFromJson" />}
    >
      <GetDataFromJsonDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function GetDataFromJsonDialog({ parentName }: { parentName: string }) {
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<GetDataFromJsonStepSchema>({
    resolver: zodResolver(getDataFromJsonStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const { fields, append } = useFieldArray({
    control: form.control,
    name: "mapping",
  })

  const onSubmit = (data: GetDataFromJsonStepSchema) => {
    setValue(`${parentName}.inputCustomFieldId`, data.inputCustomFieldId)
    setValue(`${parentName}.mapping`, data.mapping)
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
          <DialogTitle>Get data from JSON</DialogTitle>
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

            <div>
              <div className="flex w-full justify-between">
                <Label>Save response to a custom field</Label>
                <Button
                  className="text-destructive text-sm"
                  onClick={() =>
                    append({ jsonPath: "", outputCustomFieldId: "" })
                  }
                  size="sm"
                  variant="link"
                >
                  Add new
                </Button>
              </div>
              <div className="flex w-full flex-col gap-y-4">
                {fields.map((field, index) => (
                  <div className="flex w-full gap-x-2" key={field.id}>
                    <div className="w-[45%]">
                      <InputField name={`mapping.${index}.jsonPath`} />
                    </div>
                    <div className="flex h-[36px] items-center justify-center">
                      <ArrowRight size={24} />
                    </div>
                    <div className="w-[45%]">
                      <CustomFieldSelect
                        label=""
                        name={`mapping.${index}.outputCustomFieldId`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
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
