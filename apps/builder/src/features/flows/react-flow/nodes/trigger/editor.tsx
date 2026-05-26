"use client"

import type { FlowTriggerNodeType } from "@chatbotx.io/database/partials"
import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import type { TriggerNodeConfig } from "@chatbotx.io/flow-config"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@chatbotx.io/ui/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useReactFlow } from "@xyflow/react"
import {
  MessageCircleIcon,
  MessageCircleOffIcon,
  RefreshCwIcon,
  TagIcon,
  TextCursorInputIcon,
  ZapIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useCustomFieldSelectOptions } from "@/features/custom-fields/provider/custom-field-hook"
import { listLifecycleStages } from "@/features/lifecycle-stages/queries"
import { useTagSelectOptions } from "@/features/tags/provider/tag-hook"
import { useWorkspaceId } from "@/hooks/routing"

type TriggerNodeEditorProps = {
  nodeId: string
  nodeDetails: TriggerNodeConfig
}

type TriggerTypeOption = {
  value: FlowTriggerNodeType
  labelKey: string
  hintKey: string
  icon: React.ComponentType<{ className?: string }>
  /** true = totalmente funcional (worker dispatch implementado).
   *  false = UI funcional mas worker dispatch pendente (próxima iteração). */
  ready: boolean
}

const TRIGGER_OPTIONS: TriggerTypeOption[] = [
  {
    value: "conversationOpened",
    labelKey: "trigger.flowNode.conversationOpened.label",
    hintKey: "trigger.flowNode.conversationOpened.hint",
    icon: MessageCircleIcon,
    ready: true,
  },
  {
    value: "conversationClosed",
    labelKey: "trigger.flowNode.conversationClosed.label",
    hintKey: "trigger.flowNode.conversationClosed.hint",
    icon: MessageCircleOffIcon,
    ready: true,
  },
  {
    value: "contactFieldUpdated",
    labelKey: "trigger.flowNode.contactFieldUpdated.label",
    hintKey: "trigger.flowNode.contactFieldUpdated.hint",
    icon: TextCursorInputIcon,
    ready: true,
  },
  {
    value: "contactTagUpdated",
    labelKey: "trigger.flowNode.contactTagUpdated.label",
    hintKey: "trigger.flowNode.contactTagUpdated.hint",
    icon: TagIcon,
    ready: true,
  },
  {
    value: "shortcut",
    labelKey: "trigger.flowNode.shortcut.label",
    hintKey: "trigger.flowNode.shortcut.hint",
    icon: ZapIcon,
    ready: true,
  },
  {
    value: "lifecycleStageChanged",
    labelKey: "trigger.flowNode.lifecycleStageChanged.label",
    hintKey: "trigger.flowNode.lifecycleStageChanged.hint",
    icon: RefreshCwIcon,
    ready: true,
  },
]

export const TriggerNodeEditor = ({
  nodeId,
  nodeDetails,
}: TriggerNodeEditorProps) => {
  const t = useTranslations()
  const { getNodes, updateNodeData } = useReactFlow()

  const currentType: FlowTriggerNodeType = nodeDetails.triggerType

  const currentOption = useMemo(
    () => TRIGGER_OPTIONS.find((o) => o.value === currentType),
    [currentType],
  )

  /** Patch parcial do `details` mantendo o triggerType atual. */
  const patchDetails = (next: Partial<TriggerNodeConfig>) => {
    const currentNode = getNodes().find((n) => n.id === nodeId)
    if (!currentNode) {
      return
    }
    const merged = {
      ...(currentNode.data?.details ?? {}),
      ...next,
    } as TriggerNodeConfig
    updateNodeData(nodeId, {
      ...currentNode.data,
      details: merged,
    })
  }

  const handleChangeType = (next: string) => {
    const nextType = next as FlowTriggerNodeType
    const currentNode = getNodes().find((n) => n.id === nodeId)
    if (!currentNode) {
      return
    }

    // Discriminated union: reset details pro mínimo do novo tipo (perde
    // filtros antigos — esperado quando muda subtipo).
    let nextDetails: TriggerNodeConfig
    switch (nextType) {
      case "conversationOpened":
        nextDetails = { triggerType: "conversationOpened" }
        break
      case "conversationClosed":
        nextDetails = { triggerType: "conversationClosed" }
        break
      case "contactFieldUpdated":
        nextDetails = { triggerType: "contactFieldUpdated" }
        break
      case "contactTagUpdated":
        nextDetails = { triggerType: "contactTagUpdated", action: "any" }
        break
      case "shortcut":
        nextDetails = { triggerType: "shortcut" }
        break
      case "lifecycleStageChanged":
        nextDetails = {
          triggerType: "lifecycleStageChanged",
          triggerOnCleared: false,
        }
        break
      default:
        return
    }

    updateNodeData(nodeId, {
      ...currentNode.data,
      details: nextDetails,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t("trigger.flowNode.helperText")}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">{t("trigger.flowNode.typeLabel")}</Label>
        <Select onValueChange={handleChangeType} value={currentType}>
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder={t("trigger.flowNode.typePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_OPTIONS.map((opt) => {
              const Icon = opt.icon
              return (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{t(opt.labelKey)}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {currentOption && (
          <p className="text-muted-foreground text-xs">
            {t(currentOption.hintKey)}
          </p>
        )}
      </div>

      {/* Filtros específicos do subtipo */}
      <TriggerFilters details={nodeDetails} onChange={patchDetails} />
    </div>
  )
}

// ─── Filters por subtipo ────────────────────────────────────────────────────

type FiltersProps = {
  details: TriggerNodeConfig
  onChange: (next: Partial<TriggerNodeConfig>) => void
}

const TriggerFilters = ({ details, onChange }: FiltersProps) => {
  switch (details.triggerType) {
    case "contactTagUpdated":
      return <ContactTagFilters details={details} onChange={onChange} />
    case "contactFieldUpdated":
      return <ContactFieldFilters details={details} onChange={onChange} />
    case "lifecycleStageChanged":
      return <LifecycleFilters details={details} onChange={onChange} />
    case "shortcut":
      return <ShortcutFilters details={details} onChange={onChange} />
    case "conversationOpened":
    case "conversationClosed":
      return <NoFiltersHint />
    default:
      return null
  }
}

const NoFiltersHint = () => {
  const t = useTranslations()
  return (
    <div className="rounded-lg border border-border border-dashed bg-muted/20 p-3">
      <p className="text-muted-foreground text-xs">
        {t("trigger.flowNode.noFilters")}
      </p>
    </div>
  )
}

// ─── 1. Contact Tag Updated ─────────────────────────────────────────────────

const ContactTagFilters = ({
  details,
  onChange,
}: {
  details: TriggerNodeConfig & { triggerType: "contactTagUpdated" }
  onChange: FiltersProps["onChange"]
}) => {
  const t = useTranslations()
  const tagOptions = useTagSelectOptions()
  const selectedIds = details.tagIds ?? []

  const toggleTag = (tagId: string) => {
    const next = selectedIds.includes(tagId)
      ? selectedIds.filter((id) => id !== tagId)
      : [...selectedIds, tagId]
    onChange({
      triggerType: "contactTagUpdated",
      action: details.action,
      tagIds: next,
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          {t("trigger.flowNode.contactTagUpdated.actionLabel")}
        </Label>
        <RadioGroup
          className="flex flex-col gap-1.5"
          onValueChange={(v) =>
            onChange({
              triggerType: "contactTagUpdated",
              action: v as "added" | "removed" | "any",
              tagIds: details.tagIds,
            })
          }
          value={details.action ?? "any"}
        >
          <RadioOption
            label={t("trigger.flowNode.contactTagUpdated.actionAny")}
            value="any"
          />
          <RadioOption
            label={t("trigger.flowNode.contactTagUpdated.actionAdded")}
            value="added"
          />
          <RadioOption
            label={t("trigger.flowNode.contactTagUpdated.actionRemoved")}
            value="removed"
          />
        </RadioGroup>
      </div>

      <MultiCheckSelect
        anyLabel={t("trigger.flowNode.anyOption")}
        emptyHint={t("trigger.flowNode.contactTagUpdated.empty")}
        label={t("trigger.flowNode.contactTagUpdated.tagsLabel")}
        onToggle={toggleTag}
        options={tagOptions.map((o) => ({ id: o.value, name: o.label }))}
        selectedIds={selectedIds}
      />
    </div>
  )
}

// ─── 2. Contact Field Updated ───────────────────────────────────────────────

const ContactFieldFilters = ({
  details,
  onChange,
}: {
  details: TriggerNodeConfig & { triggerType: "contactFieldUpdated" }
  onChange: FiltersProps["onChange"]
}) => {
  const t = useTranslations()
  const fieldOptions = useCustomFieldSelectOptions()
  const selectedIds = details.fieldIds ?? []

  const toggleField = (fieldId: string) => {
    const next = selectedIds.includes(fieldId)
      ? selectedIds.filter((id) => id !== fieldId)
      : [...selectedIds, fieldId]
    onChange({
      triggerType: "contactFieldUpdated",
      fieldIds: next,
    })
  }

  return (
    <MultiCheckSelect
      anyLabel={t("trigger.flowNode.anyOption")}
      emptyHint={t("trigger.flowNode.contactFieldUpdated.empty")}
      label={t("trigger.flowNode.contactFieldUpdated.fieldsLabel")}
      onToggle={toggleField}
      options={fieldOptions.map((o) => ({
        id: String(o.value),
        name: o.label,
      }))}
      selectedIds={selectedIds}
    />
  )
}

// ─── 3. Lifecycle Stage Changed ─────────────────────────────────────────────

const LifecycleFilters = ({
  details,
  onChange,
}: {
  details: TriggerNodeConfig & { triggerType: "lifecycleStageChanged" }
  onChange: FiltersProps["onChange"]
}) => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [stages, setStages] = useState<LifecycleStageModel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listLifecycleStages(workspaceId)
      .then((data) => {
        if (!cancelled) {
          setStages(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const toggleId = (field: "toStageIds" | "fromStageIds", stageId: string) => {
    const current = details[field] ?? []
    const next = current.includes(stageId)
      ? current.filter((id) => id !== stageId)
      : [...current, stageId]
    onChange({
      triggerType: "lifecycleStageChanged",
      triggerOnCleared: details.triggerOnCleared,
      toStageIds: field === "toStageIds" ? next : details.toStageIds,
      fromStageIds: field === "fromStageIds" ? next : details.fromStageIds,
    })
  }

  const stageOptions = stages.map((s) => ({
    id: s.id,
    name: `${s.icon ?? "•"} ${s.name}`,
  }))

  return (
    <div className="flex flex-col gap-3">
      <MultiCheckSelect
        anyLabel={t("trigger.flowNode.anyOption")}
        emptyHint={
          loading
            ? t("trigger.flowNode.lifecycleStageChanged.loading")
            : t("trigger.flowNode.lifecycleStageChanged.emptyStages")
        }
        label={t("trigger.flowNode.lifecycleStageChanged.toStagesLabel")}
        onToggle={(id) => toggleId("toStageIds", id)}
        options={stageOptions}
        selectedIds={details.toStageIds ?? []}
      />

      <MultiCheckSelect
        anyLabel={t("trigger.flowNode.anyOption")}
        emptyHint={
          loading
            ? t("trigger.flowNode.lifecycleStageChanged.loading")
            : t("trigger.flowNode.lifecycleStageChanged.emptyStages")
        }
        label={t("trigger.flowNode.lifecycleStageChanged.fromStagesLabel")}
        onToggle={(id) => toggleId("fromStageIds", id)}
        options={stageOptions}
        selectedIds={details.fromStageIds ?? []}
      />

      {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox shadcn renderiza input filho — label envolve corretamente */}
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
        <Checkbox
          checked={details.triggerOnCleared ?? false}
          onCheckedChange={(v) =>
            onChange({
              triggerType: "lifecycleStageChanged",
              triggerOnCleared: !!v,
              toStageIds: details.toStageIds,
              fromStageIds: details.fromStageIds,
            })
          }
        />
        <span className="text-xs">
          {t("trigger.flowNode.lifecycleStageChanged.triggerOnCleared")}
        </span>
      </label>
    </div>
  )
}

// ─── 4. Shortcut ────────────────────────────────────────────────────────────

const ShortcutFilters = ({
  details,
  onChange,
}: {
  details: TriggerNodeConfig & { triggerType: "shortcut" }
  onChange: FiltersProps["onChange"]
}) => {
  const t = useTranslations()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          {t("trigger.flowNode.shortcut.iconLabel")}
        </Label>
        <Input
          className="h-9"
          maxLength={4}
          onChange={(e) =>
            onChange({
              triggerType: "shortcut",
              icon: e.target.value,
              label: details.label,
            })
          }
          placeholder="⚡"
          value={details.icon ?? ""}
        />
        <p className="text-muted-foreground text-xs">
          {t("trigger.flowNode.shortcut.iconHint")}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          {t("trigger.flowNode.shortcut.labelLabel")}
        </Label>
        <Input
          className="h-9"
          maxLength={50}
          onChange={(e) =>
            onChange({
              triggerType: "shortcut",
              icon: details.icon,
              label: e.target.value,
            })
          }
          placeholder={t("trigger.flowNode.shortcut.labelPlaceholder")}
          value={details.label ?? ""}
        />
      </div>

      <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 p-3">
        <p className="text-blue-700 text-xs dark:text-blue-400">
          {t("trigger.flowNode.shortcut.note")}
        </p>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const RadioOption = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center gap-2">
    <RadioGroupItem id={`trigger-action-${value}`} value={value} />
    <Label
      className="cursor-pointer text-xs"
      htmlFor={`trigger-action-${value}`}
    >
      {label}
    </Label>
  </div>
)

/**
 * Multi-select com lista de checkboxes. Simples e suficiente pra
 * volumes baixos (tags/fields/stages raramente passam de 50 items por workspace).
 * Quando o `selectedIds` está vazio, renderiza "Qualquer" como hint pro usuário.
 */
const MultiCheckSelect = ({
  label,
  options,
  selectedIds,
  onToggle,
  emptyHint,
  anyLabel,
}: {
  label: string
  options: { id: string; name: string }[]
  selectedIds: string[]
  onToggle: (id: string) => void
  emptyHint: string
  anyLabel: string
}) => {
  if (options.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">{label}</Label>
        <div className="rounded-md border border-border border-dashed bg-muted/20 px-3 py-2">
          <p className="text-muted-foreground text-xs">{emptyHint}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {selectedIds.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">{anyLabel}</span>
        ) : (
          <span className="text-[10px] text-primary">{selectedIds.length}</span>
        )}
      </div>
      <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-background">
        {options.map((opt) => {
          const checked = selectedIds.includes(opt.id)
          return (
            // biome-ignore lint/a11y/noLabelWithoutControl: Checkbox shadcn renderiza input filho — label envolve corretamente
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2 border-border border-b px-2 py-1.5 last:border-b-0 hover:bg-muted/50",
                checked && "bg-primary/5",
              )}
              key={opt.id}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(opt.id)}
              />
              <span className="truncate text-xs">{opt.name}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
