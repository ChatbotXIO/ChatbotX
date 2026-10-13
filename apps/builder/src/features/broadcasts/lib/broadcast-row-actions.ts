import {
  type BroadcastStatus,
  isRecurringTemplate,
} from "@chatbotx.io/database/partials"
import {
  CalendarClockIcon,
  CircleStopIcon,
  CopyIcon,
  EyeIcon,
  HistoryIcon,
  type LucideIcon,
  PencilIcon,
  PlayIcon,
  RotateCwIcon,
  SquarePenIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react"
import { parseBroadcastStatus } from "./broadcast-status"

export const BROADCAST_ROW_ACTION_VARIANTS = [
  "view",
  "viewRuns",
  "rename",
  "clone",
  "edit",
  "resend",
  "schedule",
  "moveToDraft",
  "stop",
  "resume",
  "delete",
] as const
export type BroadcastRowActionVariant =
  (typeof BROADCAST_ROW_ACTION_VARIANTS)[number]

/** `editSchedule` is how a repeating broadcast's `moveToDraft` reads. */
export type BroadcastRowActionLabelKey =
  | `actions.${BroadcastRowActionVariant}`
  | "actions.editSchedule"

type BroadcastRowActionItem = {
  icon: LucideIcon
  labelKey: BroadcastRowActionLabelKey
}

/**
 * Icon + i18n key for every row-action variant, keyed by variant so the
 * dropdown can render from `ROW_ACTIONS_BY_STATUS` without a chain of
 * inline conditionals.
 */
export const ROW_ACTION_ITEMS: Record<
  BroadcastRowActionVariant,
  BroadcastRowActionItem
> = {
  view: { icon: EyeIcon, labelKey: "actions.view" },
  viewRuns: { icon: HistoryIcon, labelKey: "actions.viewRuns" },
  rename: { icon: PencilIcon, labelKey: "actions.rename" },
  clone: { icon: CopyIcon, labelKey: "actions.clone" },
  edit: { icon: SquarePenIcon, labelKey: "actions.edit" },
  resend: { icon: RotateCwIcon, labelKey: "actions.resend" },
  schedule: { icon: CalendarClockIcon, labelKey: "actions.schedule" },
  moveToDraft: { icon: UndoIcon, labelKey: "actions.moveToDraft" },
  stop: { icon: CircleStopIcon, labelKey: "actions.stop" },
  resume: { icon: PlayIcon, labelKey: "actions.resume" },
  delete: { icon: Trash2Icon, labelKey: "actions.delete" },
}

const DEFAULT_ROW_ACTIONS: readonly BroadcastRowActionVariant[] = [
  "view",
  "rename",
  "clone",
]

/**
 * Which row-action variants are available per broadcast status. Every
 * status lists `view`, `rename` and `clone` (a clone is always a fresh
 * `draft`, so it is offered regardless of the source status). `edit`
 * reopens the create form on the
 * stored payload, so only a `draft` — the one status the service will still
 * update — may offer it. `sending` intentionally has no `delete` (the
 * service refuses to soft-delete an in-flight broadcast — stop it first);
 * `cancelled` intentionally has no `edit` (it isn't a draft) but can
 * `resume`. `scheduled` moves back to draft instead of deleting outright.
 */
export const ROW_ACTIONS_BY_STATUS: Record<
  BroadcastStatus,
  readonly BroadcastRowActionVariant[]
> = {
  draft: [...DEFAULT_ROW_ACTIONS, "edit", "schedule", "delete"],
  scheduled: [...DEFAULT_ROW_ACTIONS, "moveToDraft", "delete"],
  // A repeating broadcast is paused with `stop`; `moveToDraft` stops it so the
  // schedule can be edited.
  recurring: [
    ...DEFAULT_ROW_ACTIONS,
    "viewRuns",
    "moveToDraft",
    "stop",
    "delete",
  ],
  sending: [...DEFAULT_ROW_ACTIONS, "stop"],
  cancelled: [
    ...DEFAULT_ROW_ACTIONS,
    "viewRuns",
    "moveToDraft",
    "resume",
    "delete",
  ],
  sent: [...DEFAULT_ROW_ACTIONS, "viewRuns", "resend", "delete"],
  failed: [...DEFAULT_ROW_ACTIONS, "resend", "delete"],
}

/**
 * Resolves the row-action variants for a raw `Broadcast.status` string
 * (widened to `string` by the generated model — see `parseBroadcastStatus`).
 * An unrecognized status falls back to `view`/`rename` only.
 */
export const getBroadcastRowActions = (
  status: string,
): readonly BroadcastRowActionVariant[] => {
  const parsed = parseBroadcastStatus(status)
  return parsed ? ROW_ACTIONS_BY_STATUS[parsed] : DEFAULT_ROW_ACTIONS
}

/** The subset of a broadcast row a `ROW_ACTION_GUARDS` predicate needs. */
export type BroadcastRowActionGuardRow = {
  contactCount: number | null
  status: string
  schedulesType: string
  occurrenceAt: Date | null
}

/**
 * Per-variant guard predicates that further restrict a row-action beyond
 * its status eligibility (`ROW_ACTIONS_BY_STATUS`). A variant with no entry
 * here is always shown once its status allows it. Keyed by variant so
 * `filterBroadcastRowActions` can look guards up without inline
 * if/else branching.
 *
 * `resume`: a `cancelled` broadcast with `contactCount === null` was
 * cancelled before `prepareBroadcast` ever ran (e.g. workspace-teardown
 * cleanup of a `scheduled` broadcast) and has no recipients to resume —
 * mirrors the `contactCount IS NOT NULL` guard in
 * `broadcastService.resumeSending`. A paused repeating broadcast never has
 * recipients of its own, so it resumes regardless.
 *
 * `viewRuns`, a repeating broadcast only. `moveToDraft` on a `cancelled` row is
 * likewise only a paused repeating broadcast ("Edit schedule"); a cancelled
 * one-off has no draft to return to. `resend` is never offered for a template,
 * which sends nothing itself.
 */
export const ROW_ACTION_GUARDS: Partial<
  Record<
    BroadcastRowActionVariant,
    (row: BroadcastRowActionGuardRow) => boolean
  >
> = {
  resume: (row) => row.contactCount !== null || isRecurringTemplate(row),
  viewRuns: isRecurringTemplate,
  resend: (row) => !isRecurringTemplate(row),
  moveToDraft: (row) => row.status !== "cancelled" || isRecurringTemplate(row),
}

/** The menu label of an action for a row: a repeating broadcast edits its schedule. */
export const resolveBroadcastRowActionLabelKey = (
  variant: BroadcastRowActionVariant,
  row: BroadcastRowActionGuardRow,
): BroadcastRowActionLabelKey =>
  variant === "moveToDraft" && isRecurringTemplate(row)
    ? "actions.editSchedule"
    : ROW_ACTION_ITEMS[variant].labelKey

/**
 * Filters row-action variants against their `ROW_ACTION_GUARDS` predicate
 * (when one exists) for the given row. Consumers should pass the result of
 * `getBroadcastRowActions` through this before rendering the dropdown.
 */
export const filterBroadcastRowActions = (
  actions: readonly BroadcastRowActionVariant[],
  row: BroadcastRowActionGuardRow,
): readonly BroadcastRowActionVariant[] =>
  actions.filter((variant) => (ROW_ACTION_GUARDS[variant] ?? (() => true))(row))
