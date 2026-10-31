"use client"

import type { WorkspaceCurrencyDefault } from "@chatbotx.io/business/pipeline"
import type { PipelineSettings } from "@chatbotx.io/database/partials"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { useIsLocked } from "@/features/templates/components/lock-badge"
import { orpc } from "@/lib/orpc/query"
import type { PipelineMessageKey } from "../../lib/message-key"
import type { BoardField } from "../board/types"
import { CheckboxField } from "../shared/checkbox-field"
import { FieldsTab } from "./fields-tab"
import { GeneralTab } from "./general-tab"
import { type GrantLimits, PermissionsTab } from "./permissions-tab"
import {
  buildPermissionChanges,
  buildPipelineUpdate,
  draftErrors,
  draftFromPipeline,
  type PermissionDraft,
  type PermissionFlags,
  rebaseDraft,
  type SettingsDraft,
} from "./settings-draft"
import { type SettingsPipeline, useSaveSettings } from "./use-save-settings"

type SettingsSheetProps = {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: SettingsPipeline
  /** What a pipeline without its own currency follows today. */
  workspaceDefault: WorkspaceCurrencyDefault
  fields: BoardField[]
  /** What the caller may grant other members (mirrors the server's rule). */
  grantLimits: GrantLimits
}

const CARD_ELEMENT_KEYS = {
  contactPhone: "settings.card.contactPhone",
  contactEmail: "settings.card.contactEmail",
  createdAt: "settings.card.createdAt",
  updatedAt: "settings.card.updatedAt",
  assignees: "settings.card.assignees",
  comments: "settings.card.comments",
  cardId: "settings.card.cardId",
  priority: "settings.card.priority",
  value: "settings.card.value",
  dueDate: "settings.card.dueDate",
} as const satisfies Record<keyof PipelineSettings["cardElements"], string>

const CARD_ELEMENT_ORDER = [
  "contactPhone",
  "contactEmail",
  "createdAt",
  "updatedAt",
  "assignees",
  "comments",
  "cardId",
  "priority",
  "value",
  "dueDate",
] as const satisfies ReadonlyArray<keyof PipelineSettings["cardElements"]>

const VISIBLE_FEATURE_ORDER = [
  "priority",
  "value",
  "dueDate",
] as const satisfies ReadonlyArray<keyof PipelineSettings["visibleFeatures"]>

const STATUS_ORDER = ["open", "won", "lost"] as const satisfies ReadonlyArray<
  keyof PipelineSettings["statusLabels"]
>

const VISIBLE_FEATURE_KEYS = {
  priority: "settings.card.priority",
  value: "settings.card.value",
  dueDate: "settings.card.dueDate",
} as const satisfies Record<keyof PipelineSettings["visibleFeatures"], string>

const STATUS_LABEL_KEYS = {
  open: "settings.status.open",
  won: "settings.status.won",
  lost: "settings.status.lost",
} as const satisfies Record<keyof PipelineSettings["statusLabels"], string>

const CARD_ELEMENT_ITEMS = CARD_ELEMENT_ORDER.map((key) => ({
  key,
  labelKey: CARD_ELEMENT_KEYS[key],
}))

const VISIBLE_FEATURE_ITEMS = VISIBLE_FEATURE_ORDER.map((key) => ({
  key,
  labelKey: VISIBLE_FEATURE_KEYS[key],
}))

export function SettingsSheet({
  workspaceId,
  open,
  onOpenChange,
  pipeline,
  workspaceDefault,
  fields,
  grantLimits,
}: SettingsSheetProps) {
  const t = useTranslations("pipelines")
  // Owned here, not by the per-opening form, so closing mid-save cannot drop
  // the in-flight state; the sheet stays open until the writes settle.
  const saver = useSaveSettings(workspaceId)
  return (
    <Sheet
      onOpenChange={(next) => {
        if (next || !saver.isSaving) {
          onOpenChange(next)
        }
      }}
      open={open}
    >
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("settings.title")}</SheetTitle>
          <SheetDescription>{pipeline.name}</SheetDescription>
        </SheetHeader>
        {/* Mounted per opening, so a reopened sheet starts from the saved settings. */}
        <SettingsForm
          fields={fields}
          grantLimits={grantLimits}
          onClose={() => onOpenChange(false)}
          pipeline={pipeline}
          saver={saver}
          workspaceDefault={workspaceDefault}
          workspaceId={workspaceId}
        />
      </SheetContent>
    </Sheet>
  )
}

/**
 * The sections edit one draft; Save writes what changed (pipeline settings,
 * then member grants). Custom fields are their own records, saved by their form.
 */
function SettingsForm({
  workspaceId,
  pipeline,
  workspaceDefault,
  fields,
  onClose,
  saver,
  grantLimits,
}: Omit<SettingsSheetProps, "open" | "onOpenChange"> & {
  onClose: () => void
  saver: ReturnType<typeof useSaveSettings>
}) {
  const t = useTranslations("pipelines")
  const tc = useTranslations("actions")
  const tLocked = useTranslations("templates.locked")
  // Member grants stay editable; the pipeline content is read-only.
  const isLocked = useIsLocked(pipeline.id)
  // `base` is the settings the draft started from: Save sends what differs
  // from it, so a refetch alone never turns an untouched field into a change.
  const [base, setBase] = useState<SettingsDraft>(() =>
    draftFromPipeline(pipeline),
  )
  const [draft, setDraft] = useState<SettingsDraft>(base)
  const [seenPipeline, setSeenPipeline] = useState(pipeline)
  if (pipeline !== seenPipeline) {
    // Refetched (after Save or an edit elsewhere): untouched fields follow it.
    const nextBase = draftFromPipeline(pipeline)
    setSeenPipeline(pipeline)
    setBase(nextBase)
    setDraft((current) => rebaseDraft(current, base, nextBase))
  }
  const [permissionDraft, setPermissionDraft] = useState<PermissionDraft>({})
  const grantsQuery = useQuery(
    orpc.pipelinesAPI.privateListPipelineMembersAPI.queryOptions({
      input: { workspaceId, pipelineId: pipeline.id },
    }),
  )
  const grants = useMemo(
    () =>
      grantsQuery.data
        ? new Map<string, PermissionFlags>(
            grantsQuery.data.map((grant) => [
              grant.workspaceMemberId,
              {
                canView: grant.canView,
                canEdit: grant.canEdit,
                canDelete: grant.canDelete,
                canManageSettings: grant.canManageSettings,
              },
            ]),
          )
        : undefined,
    [grantsQuery.data],
  )
  const { save, isSaving } = saver

  const pipelineUpdate = buildPipelineUpdate(base, draft)
  const canResolveGrants = grants !== undefined && !grantsQuery.isError
  const permissionChanges = canResolveGrants
    ? buildPermissionChanges(grants, permissionDraft)
    : []
  // Grant edits made before the grants failed to (re)load cannot be diffed;
  // Save waits for a successful retry instead of silently dropping them.
  const hasUnresolvedGrants =
    !canResolveGrants && Object.keys(permissionDraft).length > 0
  const errors = draftErrors(draft)
  const hasErrors = Object.values(errors).some(Boolean) || hasUnresolvedGrants
  const isDirty = pipelineUpdate !== null || permissionChanges.length > 0

  const change = (patch: Partial<SettingsDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  const onSave = async () => {
    const sentBase = base
    const sentDraft = draft
    const ok = await save({
      pipelineId: pipeline.id,
      pipelineUpdate,
      permissionChanges,
    })
    if (ok) {
      // The sent fields are now saved; fields a refetch moved meanwhile keep
      // the refetched value, so they do not read as unsaved edits.
      setBase((current) => rebaseDraft(sentDraft, sentBase, current))
      const sentMembers = new Set(
        permissionChanges.map((change) => change.workspaceMemberId),
      )
      setPermissionDraft((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([memberId]) => !sentMembers.has(memberId),
          ),
        ),
      )
    }
  }

  // Permissions first, status labels last.
  const sections = [
    {
      id: "permissions",
      labelKey: "settings.adminPermissions",
      content: (
        <PermissionsTab
          disabled={isSaving}
          draft={permissionDraft}
          grantLimits={grantLimits}
          grants={grants}
          isError={grantsQuery.isError}
          onChange={(memberId, flags) =>
            setPermissionDraft((current) => ({ ...current, [memberId]: flags }))
          }
          onRetry={() => grantsQuery.refetch()}
          workspaceId={workspaceId}
        />
      ),
    },
    {
      id: "general",
      labelKey: "settings.general",
      content: (
        <GeneralTab
          disabled={isSaving || isLocked}
          draft={draft}
          errors={errors}
          onChange={change}
          workspaceDefault={workspaceDefault}
        />
      ),
    },
    {
      id: "fields",
      labelKey: "settings.fields",
      content: (
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={isLocked}>
          <FieldsTab
            fields={fields}
            pipelineId={pipeline.id}
            workspaceId={workspaceId}
          />
        </fieldset>
      ),
    },
    {
      id: "features",
      labelKey: "settings.features",
      content: (
        <ToggleGroupSection
          disabled={isSaving || isLocked}
          items={VISIBLE_FEATURE_ITEMS}
          onChange={(visibleFeatures) => change({ visibleFeatures })}
          values={draft.visibleFeatures}
        />
      ),
    },
    {
      id: "cardElements",
      labelKey: "settings.cardVisibleElements",
      content: (
        <ToggleGroupSection
          disabled={isSaving || isLocked}
          items={CARD_ELEMENT_ITEMS}
          onChange={(cardElements) => change({ cardElements })}
          values={draft.cardElements}
        />
      ),
    },
    {
      id: "statusLabels",
      labelKey: "settings.statusLabels",
      content: (
        <StatusLabelsSection
          disabled={isSaving || isLocked}
          labels={draft.statusLabels}
          onChange={(statusLabels) => change({ statusLabels })}
        />
      ),
    },
  ] as const

  return (
    <>
      {isLocked && (
        <div
          className="mx-4 rounded-md border bg-muted px-4 py-2 text-muted-foreground text-sm"
          data-testid="template-locked-banner"
          role="status"
        >
          {tLocked("editorBanner")}
        </div>
      )}
      <Accordion
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-6"
        defaultValue={["general"]}
        multiple
      >
        {sections.map((section) => (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger>{t(section.labelKey)}</AccordionTrigger>
            <AccordionContent>{section.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <SheetFooter className="flex-row justify-end border-t">
        <Button disabled={isSaving} onClick={onClose} variant="outline">
          {tc("cancel")}
        </Button>
        <Button disabled={!isDirty || hasErrors || isSaving} onClick={onSave}>
          {isSaving ? <Loader2Icon className="animate-spin" /> : null}
          {t("save")}
        </Button>
      </SheetFooter>
    </>
  )
}

/** One checkbox per setting of a boolean settings group. */
function ToggleGroupSection<T extends Record<string, boolean>>({
  values,
  items,
  onChange,
  disabled,
}: {
  values: T
  items: ReadonlyArray<{ key: keyof T & string; labelKey: PipelineMessageKey }>
  onChange: (values: T) => void
  disabled: boolean
}) {
  const t = useTranslations("pipelines")
  return (
    <fieldset className="grid gap-2">
      {items.map(({ key, labelKey }) => (
        <CheckboxField
          checked={values[key]}
          disabled={disabled}
          key={key}
          onCheckedChange={(checked) => onChange({ ...values, [key]: checked })}
        >
          {t(labelKey)}
        </CheckboxField>
      ))}
    </fieldset>
  )
}

function StatusLabelsSection({
  labels,
  onChange,
  disabled,
}: {
  labels: PipelineSettings["statusLabels"]
  onChange: (labels: PipelineSettings["statusLabels"]) => void
  disabled: boolean
}) {
  const t = useTranslations("pipelines")
  return (
    <fieldset className="grid gap-2">
      {STATUS_ORDER.map((status) => (
        <label
          className="grid grid-cols-[6rem_1fr] items-center gap-2"
          htmlFor={`status-label-${status}`}
          key={status}
        >
          {t(STATUS_LABEL_KEYS[status])}
          <Input
            aria-invalid={labels[status].trim().length === 0}
            disabled={disabled}
            id={`status-label-${status}`}
            maxLength={40}
            onChange={(event) =>
              onChange({ ...labels, [status]: event.target.value })
            }
            value={labels[status]}
          />
        </label>
      ))}
    </fieldset>
  )
}
