import {
  type PipelineSettings,
  type PipelineSettingsPatch,
  pipelineReferenceNameSchema,
  pipelineSettingsPatchSchema,
} from "@chatbotx.io/database/partials"
import type { SettingsPipeline } from "./use-save-settings"

/** Everything the settings sheet edits before one Save. */
export type SettingsDraft = {
  referenceName: string
  /** The limit checkbox and its raw number input (kept while unchecked). */
  limit: { enabled: boolean; value: string }
  assignContactOnAssign: boolean
  visibleFeatures: PipelineSettings["visibleFeatures"]
  cardElements: PipelineSettings["cardElements"]
  statusLabels: PipelineSettings["statusLabels"]
}

export type PermissionFlags = {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  canManageSettings: boolean
}

export const NO_PERMISSIONS: PermissionFlags = {
  canView: false,
  canEdit: false,
  canDelete: false,
  canManageSettings: false,
}

/** Per-member grants the user changed but has not saved, keyed by workspace member id. */
export type PermissionDraft = Record<string, PermissionFlags>

export type PermissionChange =
  | { kind: "set"; workspaceMemberId: string; flags: PermissionFlags }
  | { kind: "remove"; workspaceMemberId: string }

export function draftFromPipeline(pipeline: SettingsPipeline): SettingsDraft {
  const { settings } = pipeline
  return {
    referenceName: pipeline.referenceName,
    limit:
      settings.maxOpenItemsPerContact === null
        ? { enabled: false, value: "" }
        : { enabled: true, value: String(settings.maxOpenItemsPerContact) },
    assignContactOnAssign: settings.assignContactOnAssign,
    visibleFeatures: settings.visibleFeatures,
    cardElements: settings.cardElements,
    statusLabels: settings.statusLabels,
  }
}

/** Unchecked means no limit; a checked but empty or bad input fails validation. */
const parseLimit = (limit: SettingsDraft["limit"]): number | null =>
  limit.enabled
    ? Number(limit.value.trim() === "" ? Number.NaN : limit.value)
    : null

const sameRecord = <T extends object>(a: T, b: T) =>
  (Object.keys(a) as Array<keyof T>).every((key) => a[key] === b[key])

const sameValue = <T>(a: T, b: T) =>
  typeof a === "object" && a !== null && typeof b === "object" && b !== null
    ? sameRecord(a, b)
    : a === b

/**
 * The `updatePipeline` input for what the user changed since `base` (the
 * settings the sheet started from), with only the changed groups, so a
 * concurrent edit of another group is not overwritten; null when nothing changed.
 */
export function buildPipelineUpdate(
  base: SettingsDraft,
  draft: SettingsDraft,
): { referenceName?: string; settings?: PipelineSettingsPatch } | null {
  const changed = <K extends keyof SettingsDraft>(key: K) =>
    !sameValue(draft[key], base[key])
  const limit = parseLimit(draft.limit)
  const settings: PipelineSettingsPatch = {
    ...(limit === parseLimit(base.limit)
      ? {}
      : { maxOpenItemsPerContact: limit }),
    ...(changed("assignContactOnAssign")
      ? { assignContactOnAssign: draft.assignContactOnAssign }
      : {}),
    ...(changed("visibleFeatures")
      ? { visibleFeatures: draft.visibleFeatures }
      : {}),
    ...(changed("cardElements") ? { cardElements: draft.cardElements } : {}),
    ...(changed("statusLabels") ? { statusLabels: draft.statusLabels } : {}),
  }
  const update = {
    ...(changed("referenceName") ? { referenceName: draft.referenceName } : {}),
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
  }
  return Object.keys(update).length > 0 ? update : null
}

/**
 * Moves the draft onto newly loaded settings: fields the user has not touched
 * since `previousBase` take the new value, edited ones keep the user's value.
 */
export function rebaseDraft(
  draft: SettingsDraft,
  previousBase: SettingsDraft,
  nextBase: SettingsDraft,
): SettingsDraft {
  const pick = <K extends keyof SettingsDraft>(key: K): SettingsDraft[K] =>
    sameValue(draft[key], previousBase[key]) ? nextBase[key] : draft[key]
  return {
    referenceName: pick("referenceName"),
    limit: pick("limit"),
    assignContactOnAssign: pick("assignContactOnAssign"),
    visibleFeatures: pick("visibleFeatures"),
    cardElements: pick("cardElements"),
    statusLabels: pick("statusLabels"),
  }
}

/** Field-level problems that block Save; empty when the draft can be sent. */
export function draftErrors(draft: SettingsDraft) {
  return {
    referenceName: !pipelineReferenceNameSchema.safeParse(draft.referenceName)
      .success,
    limit: !pipelineSettingsPatchSchema.shape.maxOpenItemsPerContact.safeParse(
      parseLimit(draft.limit),
    ).success,
    statusLabels: Object.values(draft.statusLabels).some(
      (label) => label.trim().length === 0,
    ),
  }
}

/**
 * The member writes for the edited grants: unchanged rows are skipped, a row
 * with nothing granted is removed (or skipped when it never existed).
 */
export function buildPermissionChanges(
  grants: ReadonlyMap<string, PermissionFlags>,
  draft: PermissionDraft,
): PermissionChange[] {
  return Object.entries(draft).flatMap(
    ([workspaceMemberId, flags]): PermissionChange[] => {
      const current = grants.get(workspaceMemberId)
      if (sameRecord(flags, current ?? NO_PERMISSIONS)) {
        return []
      }
      if (sameRecord(flags, NO_PERMISSIONS)) {
        return current ? [{ kind: "remove", workspaceMemberId }] : []
      }
      return [{ kind: "set", workspaceMemberId, flags }]
    },
  )
}
