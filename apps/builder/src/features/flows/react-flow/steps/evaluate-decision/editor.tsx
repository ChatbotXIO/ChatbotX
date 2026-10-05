"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  type EvaluateDecisionStepSchema,
  evaluateDecisionStepDefaultFn,
  evaluateDecisionStepSchema,
} from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { BrainCircuitIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import {
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form"
import type { z } from "zod"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { BaseStepEditor } from "../base/editor"

const mappingValues = [
  "choice",
  "score",
  "noul",
  "confidence",
  "probability",
] as const

export default function EvaluateDecisionStepEditor({
  parentName,
}: {
  parentName: string
}) {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={BrainCircuitIcon}
      title={t("decision.evaluateDecision")}
    >
      <EvaluateDecisionDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

function EvaluateDecisionDialog({ parentName }: { parentName: string }) {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { getValues, setValue } = useFormContext()
  const form = useForm<
    z.input<typeof evaluateDecisionStepSchema>,
    unknown,
    EvaluateDecisionStepSchema
  >({
    defaultValues: {
      ...evaluateDecisionStepDefaultFn(),
      ...getValues(parentName),
    },
    mode: "onChange",
    resolver: zodResolver(evaluateDecisionStepSchema),
  })
  const { data: profiles = [] } = useQuery(
    orpc.decisionProfilesAPI.listActiveForFlow.queryOptions({
      input: { workspaceId },
      enabled: open,
    }),
  )
  const profileId = useWatch({ control: form.control, name: "profileId" })
  const selectedProfile = profiles.find((profile) => profile.id === profileId)
  const questionOptions = useMemo(
    () =>
      (selectedProfile?.contract.questions ?? []).map((question) => ({
        label: question.label,
        value: question.key,
      })),
    [selectedProfile],
  )
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    name: "fieldMappings",
  })

  const submit = (data: EvaluateDecisionStepSchema) => {
    setValue(parentName, data)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <div className="flex justify-center">
            <Button size="sm" type="button" variant="outline">
              {t("actions.edit")}
            </Button>
          </div>
        }
      />
      <DialogContent className="max-h-screen max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("decision.evaluateDecision")}</DialogTitle>
          <DialogDescription>
            {t("decision.flowStepDescription")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <SelectField
              label={t("decision.profile")}
              name="profileId"
              options={profiles.map((profile) => ({
                label: profile.name,
                value: profile.id,
              }))}
              required
            />
            <p className="text-muted-foreground text-sm">
              {t("decision.currentMessageOnly")}
            </p>
            <div className="space-y-3">
              {fields.map((field, index) => (
                <DecisionMappingRow
                  index={index}
                  key={field.id}
                  onRemove={() => remove(index)}
                  questionOptions={questionOptions}
                />
              ))}
              <Button
                onClick={() =>
                  append({
                    customFieldId: "",
                    customFieldType: "shortText",
                    questionKey: questionOptions[0]?.value ?? "",
                    value: "choice",
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon />
                {t("decision.addMapping")}
              </Button>
            </div>
            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="secondary">
                    {t("actions.cancel")}
                  </Button>
                }
              />
              <Button disabled={!form.formState.isValid} type="submit">
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function DecisionMappingRow({
  index,
  onRemove,
  questionOptions,
}: {
  index: number
  onRemove: () => void
  questionOptions: Array<{ label: string; value: string }>
}) {
  const t = useTranslations()
  const { control, setValue } = useFormContext<EvaluateDecisionStepSchema>()
  const value = useWatch({
    control,
    name: `fieldMappings.${index}.value`,
  })
  const customFieldTypes: CustomFieldType[] =
    value === "choice" ? ["shortText", "longText"] : ["number"]

  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
      <SelectField
        label={t("decision.question")}
        name={`fieldMappings.${index}.questionKey`}
        options={questionOptions}
        required
      />
      <SelectField
        label={t("decision.result")}
        name={`fieldMappings.${index}.value`}
        onValueChange={(nextValue) => {
          setValue(
            `fieldMappings.${index}.customFieldType`,
            nextValue === "choice" ? "shortText" : "number",
          )
        }}
        options={mappingValues.map((value) => ({
          label: t(`decision.resultValues.${value}`),
          value,
        }))}
        required
      />
      <CustomFieldSelect
        customFieldTypes={customFieldTypes}
        label={t("decision.destinationField")}
        name={`fieldMappings.${index}.customFieldId`}
        required
      />
      <SelectField
        label={t("decision.fieldType")}
        name={`fieldMappings.${index}.customFieldType`}
        options={customFieldTypes.map((type) => ({ label: type, value: type }))}
        required
      />
      <Button
        className="w-fit"
        onClick={onRemove}
        size="sm"
        type="button"
        variant="destructive"
      >
        <Trash2Icon />
        {t("actions.delete")}
      </Button>
    </div>
  )
}
