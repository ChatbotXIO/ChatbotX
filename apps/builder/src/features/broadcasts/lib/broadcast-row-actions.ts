import type { BroadcastStatus } from "@chatbotx.io/database/partials"
import {
  CalendarClockIcon,
  CircleStopIcon,
  EyeIcon,
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
  "rename",
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

type BroadcastRowActionItem = {
  icon: LucideIcon
  labelKey: `actions.${BroadcastRowActionVariant}`
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
  rename: { icon: PencilIcon, labelKey: "actions.rename" },
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
]

/**
 * Which row-action variants are available per broadcast status. Every
 * status lists `view` and `rename`. `edit` reopens the create form on the
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
  sending: [...DEFAULT_ROW_ACTIONS, "stop"],
  cancelled: [...DEFAULT_ROW_ACTIONS, "resume", "delete"],
  sent: [...DEFAULT_ROW_ACTIONS, "resend", "delete"],
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
 * `broadcastService.resumeSending`.
 */
export const ROW_ACTION_GUARDS: Partial<
  Record<
    BroadcastRowActionVariant,
    (row: BroadcastRowActionGuardRow) => boolean
  >
> = {
  resume: (row) => row.contactCount !== null,
}

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
