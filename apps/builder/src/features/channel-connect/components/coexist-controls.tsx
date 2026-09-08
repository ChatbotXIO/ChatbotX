"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import type { MessageKey } from "../lib/message-key"

type RowSwitchProps = {
  checked: boolean
  /**
   * Renders the switch non-interactive. Used for the sync switch on a row
   * that is selectable but not yet selected — a row that cannot be selected
   * at all renders no switch, and the AI switch only exists while its row is
   * already syncing, so neither of those goes through this flag.
   */
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
  /**
   * The row this switch belongs to (page / account / phone number). Twenty
   * rows otherwise all announce the same bare label.
   */
  rowName: string
}

type RowSwitchConfig = {
  labelKey: MessageKey
  /** Shown as the row control's tooltip — a second line of copy per row would bloat the list. */
  helperKey?: MessageKey
}

function RowSwitch({
  checked,
  disabled,
  onCheckedChange,
  rowName,
  labelKey,
  helperKey,
}: RowSwitchProps & RowSwitchConfig) {
  const t = useTranslations()
  const label = t(labelKey)

  // A real `<label>` so the visible text is a click target too, with the
  // accessible name naming the row it belongs to.
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI's Switch renders its labelable <input> inside this label — the rule cannot see through the component. The click-target test in connect-selection-form.test.tsx pins the behaviour.
    <label
      className="flex items-center justify-end gap-2"
      title={helperKey ? t(helperKey) : undefined}
    >
      <span className="whitespace-nowrap text-muted-foreground text-xs">
        {label}
      </span>
      <Switch
        aria-label={`${label} — ${rowName}`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        size="sm"
      />
    </label>
  )
}

/**
 * The per-row "sync history" opt-in rendered at the end of a picker row
 * (`CheckboxGroupField`'s `trailing`, outside the row's `<label>`). Reached
 * only through `coexistRowTrailing` below, which owns the reveal rules.
 */
function CoexistRowSwitch(props: RowSwitchProps) {
  return <RowSwitch {...props} labelKey="channels.connectMany.stepCoexist" />
}

/**
 * The per-row "AI reads synced history" option, revealed under the sync
 * switch once that row is syncing. Per row (not per batch) because the answer
 * is a property of the account's own history, not of the operator's session.
 */
function CoexistAiRowSwitch(props: RowSwitchProps) {
  return (
    <RowSwitch
      {...props}
      helperKey="coexist.aiReadsSyncedHistoryHelper"
      labelKey="coexist.aiReadsSyncedHistoryLabel"
    />
  )
}

export type CoexistOptionsPanelProps = {
  /** `CONNECT_CHANNEL_REGISTRY[channel].coexistDescriptionKey`. */
  descriptionKey: MessageKey
}

/**
 * The compact panel under the picker list, shown only once at least one row
 * opted into coexist: what syncing means for this channel and the billing
 * note. Every switch lives on its own row — nothing here is global.
 */
export function CoexistOptionsPanel({
  descriptionKey,
}: CoexistOptionsPanelProps) {
  const t = useTranslations()

  return (
    <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm">{t(descriptionKey)}</p>
      <p className="text-muted-foreground text-xs">
        {t("coexist.billingNote")}
      </p>
    </section>
  )
}

export type CoexistRowTrailingOptions = {
  /** The row this trailing column belongs to. */
  row: { name: string; disabled?: boolean }
  /** This row is syncing history — what reveals the AI option under it. */
  syncing: boolean
  /** The sync switch is inert while the row is selectable but not selected. */
  syncDisabled?: boolean
  aiReadsSyncedHistory: boolean
  onSyncChange: (checked: boolean) => void
  onAiReadsSyncedHistoryChange: (checked: boolean) => void
}

/**
 * The whole trailing column of one picker row, and the single implementation
 * of its two rules: a row that cannot be selected carries NOTHING (not a
 * disabled switch), and the "AI reads synced history" switch exists only
 * while that row is syncing. `useCoexistSelection` calls this for the two
 * react-hook-form pickers; `InstagramAccounts` calls it directly for its one
 * account (it has no form), so neither can drift from the other.
 */
export function coexistRowTrailing({
  row,
  syncing,
  syncDisabled = false,
  aiReadsSyncedHistory,
  onSyncChange,
  onAiReadsSyncedHistoryChange,
}: CoexistRowTrailingOptions): ReactNode {
  if (row.disabled) {
    return null
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <CoexistRowSwitch
        checked={syncing}
        disabled={syncDisabled}
        onCheckedChange={onSyncChange}
        rowName={row.name}
      />
      {syncing && (
        <CoexistAiRowSwitch
          checked={aiReadsSyncedHistory}
          disabled={false}
          onCheckedChange={onAiReadsSyncedHistoryChange}
          rowName={row.name}
        />
      )}
    </span>
  )
}
