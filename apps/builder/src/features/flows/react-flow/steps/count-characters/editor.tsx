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
import { CalculatorIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { BaseStepEditor } from "../base/editor"

const CountCharactersStepEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={CalculatorIcon}
      title={t("flows.actions.countCharacters")}
    >
      <CountCharactersDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function CountCharactersDialog({ parentName }: { parentName: string }) {
  const t = useTranslations()
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
            {t("actions.update")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className={"max-h-screen overflow-y-scroll lg:max-w-5xl"}>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.countCharacters")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <CustomFieldSelect
              label={t("fields.customField.label")}
              name="inputCustomFieldId"
              required
            />

            <CustomFieldSelect
              allowCreate={true}
              label={t("fields.customField.label")}
              name="outputCustomFieldId"
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

export default CountCharactersStepEditor
