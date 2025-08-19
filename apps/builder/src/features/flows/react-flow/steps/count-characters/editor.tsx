"use client"

import {
  type CountCharactersStepSchema,
  countCharactersStepSchema,
} from "@aha.chat/flow-config"
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
import { CalculatorIcon } from "lucide-react"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

export default function CountCharactersStepEditor({
  parentName,
}: {
  parentName: string
}) {
  return (
    <BaseStepEditor
      icon={CalculatorIcon}
      title={<T keyName="flows.StepType.CountCharacters" />}
    >
      <CountCharactersDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function CountCharactersDialog({ parentName }: { parentName: string }) {
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<CountCharactersStepSchema>({
    resolver: zodResolver(countCharactersStepSchema),
    defaultValues: {
      ...getValues(parentName),
    },
    mode: "onChange",
  })

  const onSubmit = (data: CountCharactersStepSchema) => {
    setValue(`${parentName}.inputCustomFieldId`, data.inputCustomFieldId)
    setValue(`${parentName}.outputCustomFieldId`, data.outputCustomFieldId)
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
          <DialogTitle>Count Characters</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <CustomFieldSelect
              isRequired
              label="Custom field"
              name="inputCustomFieldId"
            />

            <CustomFieldSelect
              allowCreate={true}
              isRequired
              label="Save to custom field"
              name="outputCustomFieldId"
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
