"use client"

import { pipelineItemStatuses } from "@chatbotx.io/database/partials"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import { FlagIcon } from "lucide-react"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { CustomFieldDraftInput } from "@/features/custom-fields/components/custom-field-value-input"
import { storedDateToDay } from "@/features/custom-fields/lib/field-date"
import { formatItemValue } from "../../lib/format-item-value"
import { priorityFlagClass, priorityKeys } from "../../lib/item-noun"
import { pipelinePriorityOptions } from "../../lib/item-options"
import type { ItemPatch } from "../../lib/item-patch"
import type { AssigneeOption } from "../../lib/use-assignee-options"
import { MAX_FIELD_VALUE_LENGTH } from "../../schema/bounds"
import type {
  BoardColumn,
  BoardField,
  BoardItemView,
  BoardPipeline,
} from "../board/types"
import {
  AssigneeAvatars,
  AssigneeChecklist,
  type AssigneeSelection,
} from "../shared/assignee-combobox"
import { DateInput } from "../shared/date-input"
import { EditablePopover, OptionList } from "./field-popover"

const EMPTY = <span className="text-muted-foreground">—</span>

export type ItemFieldsProps = {
  pipeline: Pick<BoardPipeline, "currency" | "settings">
  columns: BoardColumn[]
  fields: Pick<BoardField, "id" | "name" | "type" | "required">[]
  item: BoardItemView["item"]
  assignees: BoardItemView["assignees"]
  assigneeOptions: AssigneeOption[]
  /** Name of whoever created the item, when it is a known workspace member. */
  creatorName: string | null
  canEdit: boolean
  /** Assignee edits wait while a save or refetch is in flight. */
  assigneesLocked: boolean
  onSave: (patch: ItemPatch) => void
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-8 min-w-0 grid-cols-[8rem_minmax(0,1fr)] items-center gap-2">
      <dt className="truncate text-right text-muted-foreground" title={label}>
        {label}
      </dt>
      <dd className="flex min-w-0 items-center">{children}</dd>
    </div>
  )
}

function PriorityFlag({
  priority,
}: {
  priority: keyof typeof priorityFlagClass
}) {
  return <FlagIcon className={`size-3.5 ${priorityFlagClass[priority]}`} />
}

export function ItemFields({
  pipeline,
  columns,
  fields,
  item,
  assignees,
  assigneeOptions,
  creatorName,
  canEdit,
  assigneesLocked,
  onSave,
}: ItemFieldsProps) {
  const t = useTranslations("pipelines")
  const format = useFormatter()
  const locale = useLocale()
  const { visibleFeatures, statusLabels } = pipeline.settings
  const stage = columns.find((column) => column.stage.id === item.stageId)
  const created = format.dateTime(item.createdAt, {
    month: "short",
    day: "numeric",
    ...(item.createdAt.getFullYear() === new Date().getFullYear()
      ? {}
      : { year: "numeric" }),
  })
  // A save that would not change the stored value is skipped.
  const saveIfChanged = <K extends "status" | "priority" | "stageId" | "value">(
    key: K,
    next: BoardItemView["item"][K],
  ) => {
    if (next !== item[key]) {
      onSave({ [key]: next })
    }
  }
  const assigneeValue: AssigneeSelection = {
    memberIds: assignees.workspaceMemberIds,
    teamIds: assignees.inboxTeamIds,
  }
  const hasAssignees =
    assigneeValue.memberIds.length + assigneeValue.teamIds.length > 0

  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      <Row label={t("item.number")}>
        <span className="px-2">#{item.number}</span>
      </Row>
      <Row label={t("item.createdBy")}>
        <span className="min-w-0 truncate px-2">
          {creatorName
            ? t("item.createdByValue", { name: creatorName, date: created })
            : created}
        </span>
      </Row>
      {visibleFeatures.dueDate ? (
        <Row label={t("item.dueDate")}>
          <EditablePopover
            canEdit={canEdit}
            display={
              item.dueDate
                ? format.dateTime(item.dueDate, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : EMPTY
            }
            label={t("item.dueDate")}
            onSave={(next) => {
              const stored = item.dueDate ? item.dueDate.toISOString() : ""
              if (next !== stored) {
                onSave({ dueDate: next || null })
              }
            }}
            value={item.dueDate ? item.dueDate.toISOString() : ""}
          >
            {(draft, setDraft) => (
              <DateInput
                granularity="minute"
                label={t("item.dueDate")}
                onChange={(date) => setDraft(date ? date.toISOString() : "")}
                value={draft ? new Date(draft) : undefined}
              />
            )}
          </EditablePopover>
        </Row>
      ) : null}
      <Row label={t("item.status")}>
        <EditablePopover
          canEdit={canEdit}
          display={statusLabels[item.status]}
          label={t("item.status")}
          onSave={(next) => saveIfChanged("status", next)}
          value={item.status}
        >
          {(draft, setDraft) => (
            <OptionList
              label={t("item.status")}
              onChange={setDraft}
              options={pipelineItemStatuses.options.map((status) => ({
                value: status,
                label: statusLabels[status],
              }))}
              value={draft}
            />
          )}
        </EditablePopover>
      </Row>
      {visibleFeatures.value ? (
        <Row label={t("item.value")}>
          <EditablePopover
            canEdit={canEdit}
            canSave={(draft) => draft === "" || Number(draft) >= 0}
            display={
              item.value === null
                ? EMPTY
                : formatItemValue(item.value, pipeline.currency, locale)
            }
            label={`${t("item.value")} (${pipeline.currency})`}
            onSave={(draft) =>
              saveIfChanged("value", draft === "" ? null : Number(draft))
            }
            value={item.value === null ? "" : String(item.value)}
          >
            {(draft, setDraft) => (
              <Input
                aria-label={t("item.value")}
                min={0}
                onChange={(event) => setDraft(event.target.value)}
                step="any"
                type="number"
                value={draft}
              />
            )}
          </EditablePopover>
        </Row>
      ) : null}
      {visibleFeatures.priority ? (
        <Row label={t("item.priority")}>
          <EditablePopover
            canEdit={canEdit}
            display={
              <>
                <PriorityFlag priority={item.priority} />
                {t(priorityKeys[item.priority])}
              </>
            }
            label={t("item.priority")}
            onSave={(next) => saveIfChanged("priority", next)}
            value={item.priority}
          >
            {(draft, setDraft) => (
              <OptionList
                label={t("item.priority")}
                onChange={setDraft}
                options={pipelinePriorityOptions(t).map((option) => ({
                  ...option,
                  leading: <PriorityFlag priority={option.value} />,
                }))}
                value={draft}
              />
            )}
          </EditablePopover>
        </Row>
      ) : null}
      <Row label={t("item.assignees")}>
        <EditablePopover
          canEdit={canEdit}
          disabled={assigneesLocked}
          display={
            hasAssignees ? (
              <AssigneeAvatars
                options={assigneeOptions}
                value={assigneeValue}
              />
            ) : (
              EMPTY
            )
          }
          label={t("item.assignees")}
          onSave={(next) =>
            onSave({
              assigneeMemberIds: next.memberIds,
              assigneeInboxTeamIds: next.teamIds,
            })
          }
          value={assigneeValue}
        >
          {(draft, setDraft) => (
            <AssigneeChecklist
              onChange={setDraft}
              options={assigneeOptions}
              value={draft}
            />
          )}
        </EditablePopover>
      </Row>
      <Row label={t("item.stage")}>
        <EditablePopover
          canEdit={canEdit}
          display={stage?.stage.name ?? EMPTY}
          label={t("item.stage")}
          onSave={(next) => saveIfChanged("stageId", next)}
          value={item.stageId}
        >
          {(draft, setDraft) => (
            <OptionList
              label={t("item.stage")}
              onChange={setDraft}
              options={columns
                // Stages running a bulk job cannot receive items (the current one stays listed).
                .filter(
                  (column) =>
                    !column.stage.bulkJobId || column.stage.id === item.stageId,
                )
                .map((column) => ({
                  value: column.stage.id,
                  label: column.stage.name,
                }))}
              value={draft}
            />
          )}
        </EditablePopover>
      </Row>
      {fields.map((field) => {
        const stored = item.fieldValues[field.id] ?? ""
        return (
          <Row key={field.id} label={field.name}>
            <EditablePopover
              canEdit={canEdit}
              canSave={(draft) => draft !== "" || !field.required}
              display={<FieldValue type={field.type} value={stored} />}
              label={field.name}
              onSave={(draft) =>
                draft !== stored &&
                onSave({ fieldValues: { [field.id]: draft } })
              }
              value={stored}
            >
              {(draft, setDraft, labelId) => (
                <CustomFieldDraftInput
                  id={`field-${field.id}`}
                  labelledBy={labelId}
                  maxLength={MAX_FIELD_VALUE_LENGTH}
                  onChange={setDraft}
                  required={field.required}
                  type={field.type}
                  value={draft}
                />
              )}
            </EditablePopover>
          </Row>
        )
      })}
    </dl>
  )
}

function FieldValue({ type, value }: { type: CustomFieldType; value: string }) {
  const t = useTranslations("pipelines")
  const format = useFormatter()
  if (value === "") {
    return EMPTY
  }
  if (type === "boolean") {
    return value === "true" ? t("item.yes") : t("item.no")
  }
  if (type === "date") {
    // Same calendar-day reading as the editor, shown without any zone shift.
    const day = new Date(`${storedDateToDay(value)}T00:00:00Z`)
    return Number.isNaN(day.getTime())
      ? value
      : format.dateTime(day, { dateStyle: "medium", timeZone: "UTC" })
  }
  if (type === "datetime") {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : format.dateTime(date, { dateStyle: "medium", timeStyle: "short" })
  }
  return value
}
