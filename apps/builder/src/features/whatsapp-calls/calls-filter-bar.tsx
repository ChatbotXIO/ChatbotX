"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import type { CALL_ACTIVITY_CHIPS } from "./schema/query"

type ActivityChip = (typeof CALL_ACTIVITY_CHIPS)[number]

/** A selectable inbox or agent option — id + display name only (never the raw DB row). */
export type CallFilterOption = { id: string; name: string }

/** Sentinel the base-ui `Select` needs for "no selection" (it can't hold `undefined`) — never a real id. */
const ALL_OPTION_VALUE = ""

/**
 * B-L1 fix (Fable review) — an `inboxId`/`agentUserId` that matches no known
 * option (a stale filter param, a deleted inbox/member, a foreign id) used
 * to fall straight through to the base-ui `Select`'s `value` prop and render
 * a BLANK trigger (no option in `items` matches, so nothing renders as
 * selected) instead of visibly falling back to "All …". Also the single
 * place `value as string` casts (B-L3) used to live — narrows the
 * `Select`'s `onValueChange` callback via `typeof`, never a cast, since the
 * ui-package `Select` wrapper does not preserve base-ui's generic `Value`
 * type parameter (its `onValueChange` value is `unknown`).
 */
const resolveSelectValue = (
  value: string | undefined,
  options: { value: string }[],
): string =>
  value !== undefined && options.some((option) => option.value === value)
    ? value
    : ALL_OPTION_VALUE

const narrowSelectValue = (value: unknown): string =>
  typeof value === "string" ? value : ALL_OPTION_VALUE

type CallsFilterBarProps = {
  activity: ActivityChip | undefined
  onActivityChange: (activity: ActivityChip | undefined) => void
  inboxId: string | undefined
  onInboxChange: (inboxId: string | undefined) => void
  inboxOptions: CallFilterOption[]
  agentUserId: string | undefined
  onAgentChange: (agentUserId: string | undefined) => void
  agentOptions: CallFilterOption[]
  /** D4: the agent filter is admin-only (`superAdmin || analytics`) — everyone else's list is already scoped to their own calls. */
  showAgentFilter: boolean
}

/**
 * P5 item 6 (plan D9) — the Calls page's base activity chips: "All calls",
 * "Missed", "No reply". A chip maps 1:1 to `CALL_ACTIVITY_FILTERS` in
 * `whatsappCallHistoryService` — this bar owns no filtering logic of its
 * own, only the selected chip.
 *
 * L3 fix: plain toggle BUTTONS with `aria-pressed`, not a `tablist`/`tab`
 * pair — `role="tab"` requires an owning `tablist` to manage exactly one
 * `tabpanel` with roving `tabIndex` focus management, none of which this
 * bar implements (it just re-filters a table in place). `aria-pressed` is
 * the correct semantic for a set of independent toggle filters.
 */
export function CallsFilterBar({
  activity,
  onActivityChange,
  inboxId,
  onInboxChange,
  inboxOptions,
  agentUserId,
  onAgentChange,
  agentOptions,
  showAgentFilter,
}: CallsFilterBarProps) {
  const t = useTranslations("whatsapp.calls.page")

  const chips: { value: ActivityChip | undefined; label: string }[] = [
    { value: undefined, label: t("allActivity") },
    { value: "missed", label: t("filterMissed") },
    { value: "noReply", label: t("filterNoReply") },
  ]

  const inboxSelectOptions = [
    { label: t("allInboxes"), value: ALL_OPTION_VALUE },
    ...inboxOptions.map((inbox) => ({ label: inbox.name, value: inbox.id })),
  ]
  const agentSelectOptions = [
    { label: t("allAgents"), value: ALL_OPTION_VALUE },
    ...agentOptions.map((agent) => ({ label: agent.name, value: agent.id })),
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <fieldset
        aria-label={t("title")}
        className="m-0 flex flex-wrap gap-2 border-0 p-0"
      >
        {chips.map((chip) => (
          <Button
            aria-pressed={activity === chip.value}
            className={cn(
              activity === chip.value &&
                "bg-secondary text-secondary-foreground",
            )}
            key={chip.label}
            onClick={() => onActivityChange(chip.value)}
            size="sm"
            type="button"
            variant="outline"
          >
            {chip.label}
          </Button>
        ))}
      </fieldset>

      {inboxOptions.length > 0 && (
        <Select
          items={inboxSelectOptions}
          onValueChange={(value) => {
            const nextInboxId = narrowSelectValue(value)
            onInboxChange(
              nextInboxId === ALL_OPTION_VALUE ? undefined : nextInboxId,
            )
          }}
          value={resolveSelectValue(inboxId, inboxSelectOptions)}
        >
          <SelectTrigger
            aria-label={t("columnInbox")}
            className="w-auto min-w-40"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {inboxSelectOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showAgentFilter && agentOptions.length > 0 && (
        <Select
          items={agentSelectOptions}
          onValueChange={(value) => {
            const nextAgentUserId = narrowSelectValue(value)
            onAgentChange(
              nextAgentUserId === ALL_OPTION_VALUE
                ? undefined
                : nextAgentUserId,
            )
          }}
          value={resolveSelectValue(agentUserId, agentSelectOptions)}
        >
          <SelectTrigger
            aria-label={t("columnAgent")}
            className="w-auto min-w-40"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agentSelectOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
