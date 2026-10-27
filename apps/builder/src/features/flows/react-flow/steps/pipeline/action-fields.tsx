"use client"

import type { PipelineStepAction } from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { PlainTextEditorField } from "@/components/tiptap/plain-text-editor-field"
import { useAssigneeOptions } from "@/features/pipelines/lib/use-assignee-options"
import { usePipelineOptions } from "@/features/pipelines/lib/use-pipeline-options"
import { useWorkspaceId } from "@/hooks/routing"
import { PipelineDueDateFields } from "./due-date-fields"
import { usePipelineFields } from "./use-pipeline-fields"

type FieldsProps = { parentName: string; pipelineId: string }

const Text = ({
  parentName,
  field,
  label,
  required,
  multiline = false,
}: {
  parentName: string
  field: string
  label: string
  required?: boolean
  /** Descriptions and comments wrap over lines; titles and values stay single-line. */
  multiline?: boolean
}) => (
  <PlainTextEditorField
    // The step's own texts interpolate `{{pipelines.*}}` too (flow-actions.ts).
    includePipelineVariables
    inline={!multiline}
    label={label}
    name={`${parentName}.${field}`}
    required={required}
    showEmojiPicker={false}
  />
)

function useStatusOptions() {
  const t = useTranslations()
  return [
    { label: t("flows.pipelineStep.statusOptions.open"), value: "open" },
    { label: t("flows.pipelineStep.statusOptions.won"), value: "won" },
    { label: t("flows.pipelineStep.statusOptions.lost"), value: "lost" },
  ]
}

function AssigneeFields({ parentName }: { parentName: string }) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const options = useAssigneeOptions(workspaceId)
  const pick = (kind: "member" | "team") =>
    options
      .filter((option) => option.kind === kind)
      .map((option) => ({ label: option.label, value: option.id }))
  return (
    <>
      <MultiSelectField
        label={t("flows.pipelineStep.assigneeMembers")}
        maxCount={3}
        name={`${parentName}.assigneeMemberIds`}
        options={pick("member")}
        placeholder={t("actions.pleaseSelect")}
      />
      <MultiSelectField
        label={t("flows.pipelineStep.assigneeTeams")}
        maxCount={3}
        name={`${parentName}.assigneeInboxTeamIds`}
        options={pick("team")}
        placeholder={t("actions.pleaseSelect")}
      />
    </>
  )
}

function StageField({
  parentName,
  pipelineId,
  name,
  label,
  optional,
}: FieldsProps & { name: string; label: string; optional?: boolean }) {
  const t = useTranslations()
  const { pipelines } = usePipelineOptions()
  const stages = pipelines.find((item) => item.id === pipelineId)?.stages ?? []
  return (
    <ComboboxField
      allowClear={optional}
      clearLabel={t("flows.pipelineStep.firstStage")}
      emptyText={t("actions.noRecordFound")}
      label={label}
      name={`${parentName}.${name}`}
      options={stages.map((stage) => ({ label: stage.name, value: stage.id }))}
      placeholder={
        optional
          ? t("flows.pipelineStep.firstStage")
          : t("actions.pleaseSelect")
      }
      popoverClassName="w-[var(--anchor-width)]"
      required={!optional}
      searchPlaceholder={t("actions.search")}
    />
  )
}

function FieldValuesEditor({ parentName, pipelineId }: FieldsProps) {
  const t = useTranslations()
  const { control } = useFormContext()
  const { fields: definitions } = usePipelineFields(pipelineId)
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${parentName}.fieldValues`,
  })
  const options = definitions.map((field) => ({
    label: field.name,
    value: field.id,
  }))
  return (
    <div className="flex flex-col gap-3">
      <span className="font-medium text-sm">
        {t("flows.pipelineStep.fieldValues")}
      </span>
      {fields.map((row, index) => (
        <div className="flex flex-col gap-2 rounded-md border p-3" key={row.id}>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <ComboboxField
                emptyText={t("actions.noRecordFound")}
                label={t("flows.pipelineStep.field")}
                name={`${parentName}.fieldValues.${index}.pipelineFieldId`}
                options={options}
                placeholder={t("actions.pleaseSelect")}
                popoverClassName="w-[var(--anchor-width)]"
                searchPlaceholder={t("actions.search")}
              />
            </div>
            <Button
              aria-label={t("actions.delete")}
              onClick={() => remove(index)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon size={16} />
            </Button>
          </div>
          <Text
            field={`fieldValues.${index}.value`}
            label={t("flows.pipelineStep.fieldValue")}
            parentName={parentName}
          />
        </div>
      ))}
      <Button
        className="self-start"
        onClick={() => append({ pipelineFieldId: "", value: "" })}
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon size={14} />
        {t("flows.pipelineStep.addField")}
      </Button>
    </div>
  )
}

export function PipelineActionFields({
  action,
  parentName,
  pipelineId,
}: FieldsProps & { action: PipelineStepAction }) {
  const t = useTranslations()
  const statusOptions = useStatusOptions()
  const { fields: definitions } = usePipelineFields(pipelineId)
  const base = { parentName, pipelineId }

  switch (action) {
    case "addToPipeline":
      return (
        <>
          <Text
            field="title"
            label={t("flows.pipelineStep.title")}
            parentName={parentName}
          />
          <Text
            field="description"
            label={t("flows.pipelineStep.description")}
            multiline
            parentName={parentName}
          />
          <StageField
            {...base}
            label={t("flows.pipelineStep.stage")}
            name="stageId"
            optional
          />
          <SelectField
            formItemClassName="min-w-0 overflow-hidden"
            label={t("flows.pipelineStep.status")}
            name={`${parentName}.status`}
            options={statusOptions}
          />
          <AssigneeFields parentName={parentName} />
          <PipelineDueDateFields parentName={parentName} />
          <FieldValuesEditor {...base} />
        </>
      )
    case "moveToStage":
      return (
        <StageField
          {...base}
          label={t("flows.pipelineStep.stage")}
          name="stageId"
        />
      )
    case "changeValue":
      return (
        <Text
          field="value"
          label={t("flows.pipelineStep.value")}
          parentName={parentName}
        />
      )
    case "assign":
      return <AssigneeFields parentName={parentName} />
    case "changeStatus":
      return (
        <SelectField
          formItemClassName="min-w-0 overflow-hidden"
          label={t("flows.pipelineStep.status")}
          name={`${parentName}.status`}
          options={statusOptions}
        />
      )
    case "changePriority":
      return (
        <SelectField
          formItemClassName="min-w-0 overflow-hidden"
          label={t("flows.pipelineStep.priority")}
          name={`${parentName}.priority`}
          options={[
            { label: t("pipelines.priority.low"), value: "low" },
            { label: t("pipelines.priority.medium"), value: "medium" },
            { label: t("pipelines.priority.high"), value: "high" },
          ]}
        />
      )
    case "changeDueDate":
      return <PipelineDueDateFields parentName={parentName} />
    case "changeTitle":
      return (
        <Text
          field="title"
          label={t("flows.pipelineStep.title")}
          parentName={parentName}
          required
        />
      )
    case "setCustomField":
      return (
        <>
          <ComboboxField
            emptyText={t("actions.noRecordFound")}
            label={t("flows.pipelineStep.field")}
            name={`${parentName}.pipelineFieldId`}
            options={definitions.map((field) => ({
              label: field.name,
              value: field.id,
            }))}
            placeholder={t("actions.pleaseSelect")}
            popoverClassName="w-[var(--anchor-width)]"
            required
            searchPlaceholder={t("actions.search")}
          />
          <Text
            field="value"
            label={t("flows.pipelineStep.fieldValue")}
            parentName={parentName}
          />
        </>
      )
    case "clearCustomField":
      return (
        <MultiSelectField
          label={t("flows.pipelineStep.fields")}
          name={`${parentName}.pipelineFieldIds`}
          options={definitions.map((field) => ({
            label: field.name,
            value: field.id,
          }))}
          placeholder={t("actions.pleaseSelect")}
        />
      )
    case "changeDescription":
      return (
        <Text
          field="description"
          label={t("flows.pipelineStep.description")}
          multiline
          parentName={parentName}
        />
      )
    case "removeFromPipeline":
      return (
        <p className="text-muted-foreground text-xs">
          {t("flows.pipelineStep.removeHint")}
        </p>
      )
    case "addComment":
      return (
        <Text
          field="text"
          label={t("flows.pipelineStep.comment")}
          multiline
          parentName={parentName}
          required
        />
      )
    case "transfer":
      return <TransferFields {...base} />
    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

function TransferFields({ parentName, pipelineId }: FieldsProps) {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const { pipelines } = usePipelineOptions()
  const destinationId = useWatch({
    control,
    name: `${parentName}.destinationPipelineId`,
  }) as string | undefined
  return (
    <>
      <ComboboxField
        emptyText={t("actions.noRecordFound")}
        label={t("flows.pipelineStep.destinationPipeline")}
        name={`${parentName}.destinationPipelineId`}
        options={pipelines
          .filter((item) => item.id !== pipelineId)
          .map((item) => ({ label: item.name, value: item.id }))}
        placeholder={t("actions.pleaseSelect")}
        popoverClassName="w-[var(--anchor-width)]"
        required
        searchPlaceholder={t("actions.search")}
        triggerValueChange={() =>
          setValue(`${parentName}.destinationStageId`, undefined)
        }
      />
      {destinationId ? (
        <StageField
          label={t("flows.pipelineStep.destinationStage")}
          name="destinationStageId"
          optional
          parentName={parentName}
          pipelineId={destinationId}
        />
      ) : null}
    </>
  )
}
