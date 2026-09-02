import type { BroadcastStatus } from "@chatbotx.io/database/partials"
import {
  CalendarClockIcon,
  EyeIcon,
  type LucideIcon,
  PencilIcon,
  RotateCwIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react"
import { parseBroadcastStatus } from "./broadcast-status"

export const BROADCAST_ROW_ACTION_VARIANTS = [
  "view",
  "rename",
  "edit",
  "resend",
  "schedule",
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
  delete: { icon: Trash2Icon, labelKey: "actions.delete" },
}

const DEFAULT_ROW_ACTIONS: readonly BroadcastRowActionVariant[] = [
  "view",
  "rename",
]

/**
 * Which row-action variants are available per broadcast status. Every
 * status lists `view` and `rename`; `sent`/`failed` add `resend`; `draft`
 * adds `edit`, `schedule` and `delete`. `edit` reopens the create form on the
 * stored payload, so only a `draft` — the one status the service will still
 * update — may offer it.
 */
export const ROW_ACTIONS_BY_STATUS: Record<
  BroadcastStatus,
  readonly BroadcastRowActionVariant[]
> = {
  draft: [...DEFAULT_ROW_ACTIONS, "edit", "schedule", "delete"],
  scheduled: DEFAULT_ROW_ACTIONS,
  sending: DEFAULT_ROW_ACTIONS,
  sent: [...DEFAULT_ROW_ACTIONS, "resend"],
  failed: [...DEFAULT_ROW_ACTIONS, "resend"],
  cancelled: DEFAULT_ROW_ACTIONS,
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
