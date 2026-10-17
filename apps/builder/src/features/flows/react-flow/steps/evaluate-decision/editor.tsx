"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import {
  type EvaluateDecisionFieldMapping,
  type EvaluateDecisionStepSchema,
  evaluateDecisionStepDefaultFn,
  evaluateDecisionStepSchema,
} from "@chatbotx.io/flow-config"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
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
import { BrainCircuitIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { useCustomFields } from "@/features/custom-fields/provider/custom-field-hook"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import { BaseStepEditor } from "../base/editor"

const resultLabelKeyByValue = {
  choice: "decision.resultValues.choice",
  confidence: "decision.resultValues.confidence",
  probabilityTrue: "decision.outputNoul",
  score: "decision.resultValues.score",
  selectedProbability: "decision.resultValues.probability",
} as const

type MappingValue = EvaluateDecisionStepSchema["fieldMappings"][number]["value"]

type MappingDefinition = {
  customFieldTypes: CustomFieldType[]
  defaultCustomFieldType: CustomFieldType
  value: MappingValue
}

const mappingDefinitionsByQuestionType: Record<
  "choice" | "noul" | "score",
  MappingDefinition[]
> = {
  choice: [
    {
      customFieldTypes: ["shortText", "longText"],
      defaultCustomFieldType: "shortText",
      value: "choice",
    },
    {
      customFieldTypes: ["number"],
      defaultCustomFieldType: "number",
      value: "confidence",
    },
    {
      customFieldTypes: ["number"],
      defaultCustomFieldType: "number",
      value: "selectedProbability",
    },
  ],
  noul: [
    {
      customFieldTypes: ["number"],
      defaultCustomFieldType: "number",
      value: "probabilityTrue",
    },
  ],
  score: [
    {
      customFieldTypes: ["number"],
      defaultCustomFieldType: "number",
      value: "score",
    },
    {
      customFieldTypes: ["number"],
      defaultCustomFieldType: "number",
      value: "confidence",
    },
  ],
}

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
  const form = useForm<EvaluateDecisionStepSchema>({
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
  const { data: customFields = [] } = useCustomFields(workspaceId)
  const contextFieldOptions = customFields.map((field) => ({
    label: field.name,
    value: field.id,
  }))
  const selectedProfile = profiles.find((profile) => profile.id === profileId)
  const mappingDefinitions = useMemo(
    () =>
      selectedProfile?.contract.questions[0]
        ? mappingDefinitionsByQuestionType[
            selectedProfile.contract.questions[0].type
          ]
        : [],
    [selectedProfile],
  )
  const fieldMappings = useWatch({
    control: form.control,
    name: "fieldMappings",
  }) as EvaluateDecisionFieldMapping[]

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
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto sm:max-w-5xl">
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
              triggerValueChange={() => {
                form.setValue("fieldMappings", [], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }}
            />
            <MultiSelectField
              description={t("decision.contextProviderWarning")}
              label={t("decision.contactContext")}
              maxCount={8}
              name="contextCustomFieldIds"
              options={contextFieldOptions}
              placeholder={t("decision.contactContext")}
              required
            />
            <div className="space-y-3">
              {mappingDefinitions.map((definition) => (
                <DecisionMappingRow
                  definition={definition}
                  key={definition.value}
                  mappings={fieldMappings}
                />
              ))}
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
  definition,
  mappings,
}: {
  definition: MappingDefinition
  mappings: EvaluateDecisionFieldMapping[]
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { data: customFields = [] } = useCustomFields(workspaceId)
  const { setValue } = useFormContext<EvaluateDecisionStepSchema>()
  const index = mappings.findIndex(
    (mapping) => mapping.value === definition.value,
  )

  return (
    <div className="rounded-md border p-3">
      {index >= 0 ? (
        <CustomFieldSelect
          allowCreate
          clearable
          createDefaultType={definition.defaultCustomFieldType}
          customFieldTypes={definition.customFieldTypes}
          label={t(resultLabelKeyByValue[definition.value])}
          name={`fieldMappings.${index}.customFieldId`}
          onValueChange={(customFieldId) => {
            if (!customFieldId) {
              setValue(
                "fieldMappings",
                mappings.filter(
                  (mapping) => mapping.value !== definition.value,
                ),
                { shouldDirty: true, shouldValidate: true },
              )
              return
            }
            const customFieldType = customFields.find(
              (field) => field.id === customFieldId,
            )?.type
            if (
              customFieldType === "longText" ||
              customFieldType === "number" ||
              customFieldType === "shortText"
            ) {
              setValue(
                `fieldMappings.${index}.customFieldType`,
                customFieldType,
                { shouldValidate: true },
              )
            }
          }}
          required
        />
      ) : (
        <CustomFieldSelect
          allowCreate
          clearable
          createDefaultType={definition.defaultCustomFieldType}
          customFieldTypes={definition.customFieldTypes}
          label={t(resultLabelKeyByValue[definition.value])}
          name={`fieldMappings.${mappings.length}.customFieldId`}
          onValueChange={(customFieldId) => {
            if (!customFieldId) {
              return
            }
            const customFieldType = customFields.find(
              (field) => field.id === customFieldId,
            )?.type
            let mapping: EvaluateDecisionFieldMapping | undefined
            if (customFieldType === "number" && definition.value !== "choice") {
              mapping = {
                customFieldId,
                customFieldType,
                questionKey: "result",
                value: definition.value,
              }
            } else if (
              (customFieldType === "longText" ||
                customFieldType === "shortText") &&
              definition.value === "choice"
            ) {
              mapping = {
                customFieldId,
                customFieldType,
                questionKey: "result",
                value: definition.value,
              }
            }
            if (mapping) {
              setValue("fieldMappings", [...mappings, mapping], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          }}
        />
      )}
    </div>
  )
}
