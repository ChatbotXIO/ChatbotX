"use client"

import {
  type QuestionnairesStepSchema,
  questionnaireActionModes,
  questionnairesStepSchema,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ClipboardListIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import type { Resolver, SubmitHandler } from "react-hook-form"
import { useForm, useFormContext } from "react-hook-form"
import { useQuestionnaireSelectOptions } from "@/features/questionnaires/provider/questionnaire-hook"
import { BaseStepEditor } from "../base/editor"

export function QuestionnairesActionEditor({
  parentName,
}: {
  parentName: string
}) {
  const t = useTranslations()
  const { getValues, setValue } = useFormContext()
  const [open, setOpen] = useState(false)
  const questionnaireOptions = useQuestionnaireSelectOptions()
  const form = useForm<QuestionnairesStepSchema>({
    resolver: zodResolver(
      questionnairesStepSchema,
    ) as Resolver<QuestionnairesStepSchema>,
    defaultValues: getValues(parentName),
    mode: "onChange",
  })

  const modeOptions = useMemo(
    () =>
      questionnaireActionModes.options.map((value) => ({
        value,
        label: t(`questionnaires.flowModes.${value}`),
      })),
    [t],
  )

  const onSubmit: SubmitHandler<QuestionnairesStepSchema> = (values) => {
    setValue(`${parentName}.mode`, values.mode)
    setValue(`${parentName}.questionnaireId`, values.questionnaireId)
    setOpen(false)
  }

  return (
    <BaseStepEditor
      icon={ClipboardListIcon}
      title={t("flows.actions.questionnaires")}
    >
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger
          render={
            <Button size="sm" type="button" variant="outline">
              {t("actions.edit")}
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("flows.actions.questionnaires")}</DialogTitle>
            <DialogDescription>
              {t("questionnaires.dialogDescriptions.flowStep")}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              className="flex flex-col gap-4"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <SelectField
                label={t("questionnaires.mode")}
                name="mode"
                options={modeOptions}
                required
              />
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("questionnaires.singular")}
                name="questionnaireId"
                options={questionnaireOptions}
                placeholder={t("actions.pleaseSelect")}
                required
              />
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setOpen(false)}
                  type="button"
                  variant="ghost"
                >
                  {t("actions.cancel")}
                </Button>
                <Button disabled={!form.formState.isValid} type="submit">
                  {t("actions.continue")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </BaseStepEditor>
  )
}
