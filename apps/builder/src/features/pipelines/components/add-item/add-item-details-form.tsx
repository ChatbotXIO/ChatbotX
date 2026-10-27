"use client"

import {
  pipelineItemPriorities,
  pipelineItemStatuses,
} from "@chatbotx.io/database/partials"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { InputNumberField } from "@chatbotx.io/ui/components/form/input-number-field"
import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { useFormOptionalLabel } from "@chatbotx.io/ui/components/form/optional-label-context"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { PaperclipIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CustomFieldValueInput } from "@/features/custom-fields/components/custom-field-value-input"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import { useContactAssigneeMultiSelectOptions } from "@/features/users/provider/user-hook"
import { ITEM_VALUE_DECIMALS } from "../../lib/add-item-form"
import { priorityKeys } from "../../lib/item-noun"
import { MAX_FIELD_VALUE_LENGTH } from "../../schema/bounds"
import type { BoardField, BoardPipeline } from "../board/types"

export type AttachedFile = { id: string; name: string }

type AddItemDetailsFormProps = {
  workspaceId: string
  pipeline: Pick<BoardPipeline, "currency" | "settings">
  openStages: Array<{ id: string; name: string }>
  fields: Pick<BoardField, "id" | "name" | "type" | "required">[]
  files: AttachedFile[]
  onFilesChange: (files: AttachedFile[]) => void
}

/** Step 2 of the add-item sheet: every field of the new item (inside a `<Form>`). */
export function AddItemDetailsForm({
  workspaceId,
  pipeline,
  openStages,
  fields,
  files,
  onFilesChange,
}: AddItemDetailsFormProps) {
  const t = useTranslations("pipelines")
  const { visibleFeatures, statusLabels } = pipeline.settings
  const assigneeOptions = useContactAssigneeMultiSelectOptions({
    groupLabels: {
      agents: t("item.assigneesMembers"),
      teams: t("item.assigneesTeams"),
    },
    agentValue: "memberId",
  })
  const optionalLabel = useFormOptionalLabel()

  return (
    <>
      <InputField
        label={t("item.title")}
        maxLength={200}
        name="title"
        required
      />
      {visibleFeatures.value ? (
        <InputNumberField
          decimalScale={ITEM_VALUE_DECIMALS}
          label={t("item.value")}
          min={0}
          name="value"
          suffix={pipeline.currency}
        />
      ) : null}
      <TextareaField
        label={t("item.description")}
        maxLength={5000}
        name="description"
        rows={3}
      />
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">{t("item.attachments")}</span>
          <MediaLibraryTrigger
            multiple
            onSelect={() => undefined}
            onSelectMultiple={(selected) =>
              onFilesChange([
                ...files,
                ...selected
                  .filter((file) => !files.some((c) => c.id === file.id))
                  .map((file) => ({ id: file.id, name: file.name })),
              ])
            }
            workspaceId={workspaceId}
          >
            <Button size="sm" type="button" variant="outline">
              <PaperclipIcon />
              {t("item.attach")}
            </Button>
          </MediaLibraryTrigger>
        </div>
        {files.map((file) => (
          <div
            className="flex items-center justify-between rounded-md border px-2 py-1"
            key={file.id}
          >
            <span className="truncate">{file.name}</span>
            <Button
              aria-label={t("item.removeAttachment")}
              className="size-6"
              onClick={() =>
                onFilesChange(files.filter((entry) => entry.id !== file.id))
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        ))}
      </div>
      <MultiSelectField
        label={t("item.assignees")}
        name="assignees"
        options={assigneeOptions}
        placeholder={t("item.assigneesPlaceholder")}
      />
      <div className="grid grid-cols-2 gap-3">
        {visibleFeatures.priority ? (
          <SelectField
            label={t("item.priority")}
            name="priority"
            options={pipelineItemPriorities.options.map((option) => ({
              value: option,
              label: t(priorityKeys[option]),
            }))}
            required
          />
        ) : null}
        <SelectField
          label={t("item.status")}
          name="status"
          options={pipelineItemStatuses.options.map((option) => ({
            value: option,
            label: statusLabels[option],
          }))}
          required
        />
        <ComboboxField
          allowClear
          clearLabel={t("item.firstStage")}
          label={t("item.stage")}
          name="stageId"
          options={openStages.map((stage) => ({
            value: stage.id,
            label: stage.name,
          }))}
          placeholder={t("item.firstStage")}
        />
        {visibleFeatures.dueDate ? (
          // Same editor as datetime custom fields: app calendar, locale, clear.
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-1" id="add-item-due-date">
              {t("item.dueDate")}
              <span className="self-start font-normal text-xxs">
                {optionalLabel}
              </span>
            </Label>
            <CustomFieldValueInput
              labelledBy="add-item-due-date"
              name="dueDate"
              type="datetime"
            />
          </div>
        ) : null}
      </div>
      {fields.map((field) => (
        <div className="grid gap-1.5" key={field.id}>
          {/* Same marker convention as FormFieldWrapper: only optional fields are flagged. */}
          <Label
            className="flex items-center gap-1"
            id={`add-item-field-${field.id}`}
          >
            {field.name}
            {field.required ? null : (
              <span className="self-start font-normal text-xxs">
                {optionalLabel}
              </span>
            )}
          </Label>
          <CustomFieldValueInput
            labelledBy={`add-item-field-${field.id}`}
            maxLength={MAX_FIELD_VALUE_LENGTH}
            name={`fieldValues.${field.id}`}
            required={field.required}
            type={field.type}
          />
        </div>
      ))}
    </>
  )
}
