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
    setValue(`${parentName}.inputCfId`, data.inputCfId)
    setValue(`${parentName}.outputCfId`, data.outputCfId)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
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
              label={t("fields.inputCfId.label")}
              name="inputCfId"
              required
            />

            <CustomFieldSelect
              allowCreate={true}
              customFieldTypes={["number"]}
              label={t("fields.outputCfId.label")}
              name="outputCfId"
              required
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
                  {t("actions.cancel")}
                </Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
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
