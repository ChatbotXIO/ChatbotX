"use client"

import {
  pipelineActivityGroups,
  pipelineItemPriorities,
  pipelineItemStatuses,
} from "@chatbotx.io/database/partials"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { ArrowLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useState } from "react"
import {
  useWorkspaceMembers,
  workspaceMemberLabel,
} from "@/features/users/provider/user-hook"
import { ACTIVITY_GROUP_LABEL_KEYS } from "../../lib/activity-group-keys"
import {
  itemNounKeys,
  priorityKeys,
  statusFilterKeys,
} from "../../lib/item-noun"
import { useAssigneeOptions } from "../../lib/use-assignee-options"
import { hiddenFeatureKeys } from "../../lib/visible-features"
import { CheckboxField, CheckboxGroup } from "../shared/checkbox-field"
import { FilterDatePresets } from "./filter-date-range"
import { FilterFieldSection } from "./filter-field-section"
import {
  ACTIVITY_ACTORS_ROW,
  ACTIVITY_KINDS_ROW,
  ACTIVITY_WHEN_ROW,
  applyDateChoice,
  cleanFilter,
  type DateRangeValue,
  dateChoiceOf,
  filterRowCounts,
  openFilterRowIds,
  readDateRow,
  readFieldCondition,
  selectedActivityGroups,
  toggle,
  toggleActivityGroup,
  writeActivityMatch,
  writeDateRow,
  writeFieldCondition,
} from "./filter-helpers"
import { FilterValueSection } from "./filter-value-section"
import type { BoardField, BoardFilterInput, BoardPipeline } from "./types"

type FilterSheetProps = {
  workspaceId: string
  /** Bumped by the parent each time it opens the sheet, to reseed the draft. */
  session: number
  open: boolean
  onOpenChange: (open: boolean) => void
  filter: BoardFilterInput
  onApply: (filter: BoardFilterInput) => void
  pipeline: Pick<BoardPipeline, "type" | "settings" | "currency">
  fields: BoardField[]
}

type FilterRow = {
  id: string
  label: string
  count: number
  content: ReactNode
  /** Clears just this row's conditions. */
  reset: () => void
}

/**
 * The draft is seeded from the applied filter, so the body is re-keyed by
 * `session` each time the sheet opens (and stays mounted while it animates
 * closed).
 */
export function FilterSheet({
  open,
  onOpenChange,
  session,
  ...rest
}: FilterSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <FilterSheetBody key={session} onOpenChange={onOpenChange} {...rest} />
    </Sheet>
  )
}

function FilterSheetBody({
  workspaceId,
  onOpenChange,
  filter,
  onApply,
  pipeline,
  fields,
}: Omit<FilterSheetProps, "open" | "session">) {
  const t = useTranslations("pipelines")
  const assignees = useAssigneeOptions(workspaceId)
  const { data: members = [] } = useWorkspaceMembers(workspaceId)
  const [draft, setDraft] = useState<BoardFilterInput>(filter)
  // Sections holding a saved value open expanded, so reopening the sheet shows
  // what is filtered (the body mounts per opening, so this reads the saved filter).
  const [initiallyOpen] = useState(() => openFilterRowIds(filter))

  const noun = t(itemNounKeys[pipeline.type].one)
  const { statusLabels } = pipeline.settings

  const counts = filterRowCounts(draft)
  const update = (patch: Partial<BoardFilterInput>) =>
    setDraft({ ...draft, ...patch })

  const dateRow = (
    id: string,
    label: string,
    options?: { includeFuture?: boolean },
  ): FilterRow => ({
    id,
    label,
    count: counts[id] ?? 0,
    reset: () => setDraft(writeDateRow(draft, id, {})),
    content: (
      <FilterDatePresets
        choice={dateChoiceOf(draft, id)}
        includeFuture={options?.includeFuture}
        label={label}
        onChoice={(choice) => setDraft(applyDateChoice(draft, id, choice))}
        onRangeChange={(range: DateRangeValue) =>
          setDraft(
            writeDateRow(draft, id, {
              preset: draft.presets?.[id] ?? "custom",
              range,
            }),
          )
        }
        range={readDateRow(draft, id).range}
      />
    ),
  })

  const hiddenRowIds = hiddenFeatureKeys(pipeline.settings.visibleFeatures)
  const valueLabel = t("filter.value", { noun })

  const rows: FilterRow[] = [
    {
      id: "assignees",
      label: t("filter.assignee"),
      count: counts.assignees ?? 0,
      reset: () =>
        update({ assigneeMemberIds: undefined, assigneeTeamIds: undefined }),
      content: (
        <div className="grid gap-2">
          {assignees.map((assignee) => {
            const key =
              assignee.kind === "member"
                ? "assigneeMemberIds"
                : "assigneeTeamIds"
            return (
              <CheckboxField
                checked={draft[key]?.includes(assignee.id) ?? false}
                key={assignee.id}
                onCheckedChange={() =>
                  update({ [key]: toggle(draft[key], assignee.id) })
                }
              >
                {assignee.label}
              </CheckboxField>
            )
          })}
        </div>
      ),
    },
    {
      id: "status",
      label: t("filter.status"),
      count: counts.status ?? 0,
      reset: () => update({ statuses: undefined }),
      content: (
        <CheckboxGroup
          onToggle={(status) =>
            update({ statuses: toggle(draft.statuses, status) })
          }
          options={pipelineItemStatuses.options.map((status) => ({
            value: status,
            label: statusLabels[status] || t(statusFilterKeys[status]),
          }))}
          selected={draft.statuses}
        />
      ),
    },
    {
      id: "priority",
      label: t("filter.priority"),
      count: counts.priority ?? 0,
      reset: () => update({ priorities: undefined }),
      content: (
        <CheckboxGroup
          onToggle={(priority) =>
            update({ priorities: toggle(draft.priorities, priority) })
          }
          options={pipelineItemPriorities.options.map((priority) => ({
            value: priority,
            label: t(priorityKeys[priority]),
          }))}
          selected={draft.priorities}
        />
      ),
    },
    {
      id: "value",
      label: valueLabel,
      count: counts.value ?? 0,
      reset: () => update({ value: undefined }),
      content: (
        <FilterValueSection
          currency={pipeline.currency}
          label={valueLabel}
          onChange={(value) => update({ value })}
          value={draft.value}
        />
      ),
    },
    dateRow("dueDate", t("filter.dueDate"), { includeFuture: true }),
    dateRow("createdAt", t("filter.createdAt")),
    dateRow("updatedAt", t("filter.updatedAt")),
    dateRow("closedAs-won", t("filter.resolvedOn", { noun })),
    dateRow("closedAs-lost", t("filter.notResolvedOn", { noun })),
    dateRow("statusChangedAt", t("filter.statusChangedOn")),
    dateRow("stageEnteredAt", t("filter.stageChangedOn")),
    dateRow("lastCommentAt", t("filter.lastCommentOn")),
  ].filter((row) => !hiddenRowIds.has(row.id))

  const fieldRow = (field: BoardField): FilterRow => {
    const id = `field-${field.id}`
    return {
      id,
      label: field.name,
      count: counts[id] ?? 0,
      reset: () => setDraft(writeFieldCondition(draft, field.id, undefined)),
      content: (
        <FilterFieldSection
          condition={readFieldCondition(draft, field.id)}
          field={field}
          onChange={(condition) =>
            setDraft(writeFieldCondition(draft, field.id, condition))
          }
        />
      ),
    }
  }

  const fieldRows: FilterRow[] = fields.map(fieldRow)

  const activity = draft.activityMatch
  const updateActivity = (patch: NonNullable<typeof activity>) =>
    setDraft(writeActivityMatch(draft, patch))

  // Activity rows are not custom fields; they follow them under their own heading.
  const activityRows: FilterRow[] = [
    {
      id: ACTIVITY_KINDS_ROW,
      label: t("filter.activityKinds"),
      count: counts[ACTIVITY_KINDS_ROW] ?? 0,
      reset: () => updateActivity({ kinds: undefined }),
      content: (
        <CheckboxGroup
          onToggle={(group) =>
            updateActivity({
              kinds: toggleActivityGroup(activity?.kinds, group),
            })
          }
          options={pipelineActivityGroups.options.map((group) => ({
            value: group,
            label: t(ACTIVITY_GROUP_LABEL_KEYS[group]),
          }))}
          selected={selectedActivityGroups(activity?.kinds)}
        />
      ),
    },
    {
      id: ACTIVITY_ACTORS_ROW,
      label: t("filter.activityActors"),
      count: counts[ACTIVITY_ACTORS_ROW] ?? 0,
      reset: () =>
        updateActivity({ actorUserIds: undefined, automation: undefined }),
      content: (
        <div className="grid gap-2">
          {members.flatMap((member) =>
            member.user?.id
              ? [
                  <CheckboxField
                    checked={
                      activity?.actorUserIds?.includes(member.user.id) ?? false
                    }
                    key={member.user.id}
                    onCheckedChange={() =>
                      updateActivity({
                        actorUserIds: toggle(
                          activity?.actorUserIds,
                          member.user?.id ?? "",
                        ),
                      })
                    }
                  >
                    {workspaceMemberLabel(member)}
                  </CheckboxField>,
                ]
              : [],
          )}
          <CheckboxField
            checked={activity?.automation ?? false}
            onCheckedChange={(checked) =>
              updateActivity({ automation: checked || undefined })
            }
          >
            {t("filter.activityAutomation")}
          </CheckboxField>
        </div>
      ),
    },
    dateRow(ACTIVITY_WHEN_ROW, t("filter.activityWhen")),
  ]

  const apply = () => {
    onApply(cleanFilter(draft))
    onOpenChange(false)
  }

  const renderRow = (row: FilterRow) => (
    <AccordionItem key={row.id} value={row.id}>
      <AccordionTrigger className="px-1">
        <span className="flex items-center gap-2">
          {row.label}
          {row.count > 0 ? (
            <Badge className="rounded-full" variant="secondary">
              {row.count}
            </Badge>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent className="grid gap-3 px-1">
        {row.content}
        <Button
          className="justify-self-start"
          disabled={row.count === 0}
          onClick={row.reset}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("filter.reset")}
        </Button>
      </AccordionContent>
    </AccordionItem>
  )

  return (
    <SheetContent className="w-full sm:max-w-md">
      <SheetHeader className="flex-row items-center gap-2 pe-12">
        <Button
          aria-label={t("filter.back")}
          onClick={() => onOpenChange(false)}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <SheetTitle className="flex-1">{t("filter.title")}</SheetTitle>
        <Button onClick={apply} size="sm">
          {t("save")}
        </Button>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 text-sm">
        <Accordion
          className="rounded-lg border px-3"
          defaultValue={initiallyOpen}
          multiple
        >
          {rows.map(renderRow)}
        </Accordion>
        {fieldRows.length > 0 ? (
          <section
            aria-labelledby="pipeline-filter-custom-fields"
            className="mt-3 grid gap-2"
          >
            <h3
              className="font-medium text-base"
              id="pipeline-filter-custom-fields"
            >
              {t("filter.customFields")}
            </h3>
            <Accordion
              className="rounded-lg border px-3"
              defaultValue={initiallyOpen}
              multiple
            >
              {fieldRows.map(renderRow)}
            </Accordion>
          </section>
        ) : null}
        <section
          aria-labelledby="pipeline-filter-activity"
          className="mt-3 grid gap-2"
        >
          <h3 className="font-medium text-base" id="pipeline-filter-activity">
            {t("filter.activity")}
          </h3>
          <Accordion
            className="rounded-lg border px-3"
            defaultValue={initiallyOpen}
            multiple
          >
            {activityRows.map(renderRow)}
          </Accordion>
        </section>
        <Button
          className="self-start"
          onClick={() => {
            setDraft({})
            onApply({})
            onOpenChange(false)
          }}
          variant="ghost"
        >
          {t("filter.clear")}
        </Button>
      </div>
    </SheetContent>
  )
}
