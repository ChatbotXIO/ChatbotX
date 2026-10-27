"use client"

import type { PipelineStepDueDate } from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { toDateTimeLocalInput } from "@/features/custom-fields/lib/field-date"

export function PipelineDueDateFields({ parentName }: { parentName: string }) {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const base = `${parentName}.dueDate`
  const dueDate = useWatch({ control, name: base }) as
    | PipelineStepDueDate
    | undefined
  const mode = dueDate?.mode ?? "none"

  const changeMode = (next?: string) => {
    let value: PipelineStepDueDate = { mode: "none" }
    if (next === "customField") {
      value = { mode: "customField", customFieldId: "" }
    } else if (next === "fixed") {
      value = { mode: "fixed", at: new Date().toISOString() }
    }
    setValue(base, value, { shouldDirty: true, shouldValidate: true })
  }

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        formItemClassName="min-w-0 overflow-hidden"
        label={t("flows.pipelineStep.dueDate")}
        name={`${base}.mode`}
        options={[
          { label: t("flows.pipelineStep.dueNone"), value: "none" },
          {
            label: t("flows.pipelineStep.dueCustomField"),
            value: "customField",
          },
          { label: t("flows.pipelineStep.dueFixed"), value: "fixed" },
        ]}
        triggerValueChange={changeMode}
      />
      {dueDate?.mode === "customField" ? (
        <CustomFieldSelect
          customFieldTypes={["date", "datetime"]}
          label={t("flows.pipelineStep.dueField")}
          name={`${base}.customFieldId`}
          required
        />
      ) : null}
      {dueDate?.mode === "fixed" ? (
        <Input
          aria-label={t("flows.pipelineStep.dueFixed")}
          onChange={(event) => {
            const parsed = new Date(event.target.value)
            if (!Number.isNaN(parsed.getTime())) {
              setValue(`${base}.at`, parsed.toISOString(), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          }}
          type="datetime-local"
          value={toDateTimeLocalInput(dueDate.at)}
        />
      ) : null}
      {mode === "none" ? (
        <p className="text-muted-foreground text-xs">
          {t("flows.pipelineStep.dueNoneHint")}
        </p>
      ) : null}
    </div>
  )
}
