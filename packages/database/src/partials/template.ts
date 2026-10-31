import { z } from "zod"

/**
 * Every resource category a Template can bundle. Kept as a single source of
 * truth so the business-layer adapter registry can `satisfies
 * Record<TemplateCategory, ResourceAdapter>` and fail to compile if a
 * category is ever added here without a matching adapter.
 */
/**
 * Manifest-only categories (`customFields`/`tags`/`productCategories`)
 * resolve in Phase R before any adapter runs and never get their own
 * `ResourceAdapter` — kept as a separate enum so
 * `templateResourceCategories` below can `Exclude` them and let the adapter
 * registry `satisfies Record<TemplateResourceCategory, ResourceAdapter>` with
 * no `Partial`, making a category added here without a matching adapter a
 * compile error again (see `adapters/registry.ts`).
 */
export const templateManifestOnlyCategories = z.enum([
  "customFields",
  "tags",
  "productCategories",
])
export type TemplateManifestOnlyCategory = z.infer<
  typeof templateManifestOnlyCategories
>

export const templateResourceCategories = z.enum([
  "flows",
  "products",
  "aiFunctions",
  "aiAgents",
  "calendars",
  "webchats",
  "keywords",
  "entryPointLinks",
  "triggers",
  "fbCommentAutomations",
  "settings",
  "sequences",
  "aiMcpServers",
  "aiFiles",
  "questionnaires",
  "couponTopics",
  "pipelines",
])
export type TemplateResourceCategory = z.infer<
  typeof templateResourceCategories
>

export const templateCategories = z.enum([
  ...templateResourceCategories.options,
  ...templateManifestOnlyCategories.options,
])
export type TemplateCategory = z.infer<typeof templateCategories>

export const templateInstallationStatuses = z.enum([
  "pending",
  "installing",
  "completed",
  "partial",
  "failed",
  "uninstalled",
])
export type TemplateInstallationStatus = z.infer<
  typeof templateInstallationStatuses
>

/**
 * Who a row acts as when nobody is clicking: a workspace member (whose id can
 * later be nulled by a user delete, which must read as lost access) or a
 * workspace API token (no member row, by design).
 */
export const templateActorKinds = z.enum(["member", "apiToken"])
export type TemplateActorKind = z.infer<typeof templateActorKinds>

/** Installations an uninstall, sync or restore may still act on (not failed, not uninstalled). */
export const isActiveInstallation = (status: string): boolean =>
  status === "completed" || status === "partial"

/** Who asked for an uninstall. */
export const templateUninstallRequesters = z.enum(["publisher", "installer"])
export type TemplateUninstallRequester = z.infer<
  typeof templateUninstallRequesters
>

/**
 * What an uninstall did with the copies the installation created, by count.
 * Stored as jsonb: rows written before `keptHasDependents` existed lack the
 * key, so always read through `parseTemplateUninstallCounts` (default 0).
 */
export const templateUninstallCountsSchema = z.object({
  /** Copies deleted, edited ones included. */
  deleted: z.number().int().nonnegative().default(0),
  /** Of `deleted`: the copies the installer had edited, whose edits are lost. */
  deletedModified: z.number().int().nonnegative().default(0),
  /**
   * Of `deleted`: copies of a kind whose edits cannot be detected (no
   * fingerprint), so nobody can say whether work was lost.
   */
  deletedUnverified: z.number().int().nonnegative().default(0),
  /** Legacy only (the conservative uninstall kept edited copies); never written now. */
  keptModified: z.number().int().nonnegative().default(0),
  /** Tags, fields, folders and the like, which may be in use elsewhere: kept. */
  keptShared: z.number().int().nonnegative().default(0),
  /** Kinds an uninstall does not delete yet: kept, no longer locked. */
  keptByPolicy: z.number().int().nonnegative().default(0),
  /** Copies something else still depends on (e.g. a flow another resource references): kept. */
  keptHasDependents: z.number().int().nonnegative().default(0),
  /** Copies past the point of no return that a reference now blocks: remove the reference, then retry. */
  blockedByReference: z.number().int().nonnegative().default(0),
  /**
   * Copies a cancel gave back after they were past the point of no return and
   * blocked by a reference: kept and active again, but their history children
   * (stats, enrollments, ...) may already be gone.
   */
  keptPartlyRemoved: z.number().int().nonnegative().default(0),
  /** Copies another installation still locks against deletion: kept. */
  keptLockedByOther: z.number().int().nonnegative().default(0),
  /** Copies that were already gone when the uninstall reached them. */
  absent: z.number().int().nonnegative().default(0),
  /** Copies whose delete failed; a retry runs only these again. */
  failed: z.number().int().nonnegative().default(0),
})
export type TemplateUninstallCounts = z.output<
  typeof templateUninstallCountsSchema
>

/** Reads stored (possibly pre-`keptHasDependents`) counts; `null` stays `null`. */
export const parseTemplateUninstallCounts = (
  value: unknown,
): TemplateUninstallCounts | null => {
  if (value === null || value === undefined) {
    return null
  }
  const parsed = templateUninstallCountsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export const emptyTemplateUninstallCounts = (): TemplateUninstallCounts => ({
  deleted: 0,
  deletedModified: 0,
  deletedUnverified: 0,
  keptModified: 0,
  keptShared: 0,
  keptByPolicy: 0,
  keptHasDependents: 0,
  keptLockedByOther: 0,
  blockedByReference: 0,
  keptPartlyRemoved: 0,
  absent: 0,
  failed: 0,
})

export const sumTemplateUninstallCounts = (
  a: TemplateUninstallCounts,
  b: TemplateUninstallCounts,
): TemplateUninstallCounts => ({
  deleted: a.deleted + b.deleted,
  deletedModified: a.deletedModified + b.deletedModified,
  deletedUnverified: a.deletedUnverified + b.deletedUnverified,
  keptModified: a.keptModified + b.keptModified,
  keptShared: a.keptShared + b.keptShared,
  keptByPolicy: a.keptByPolicy + b.keptByPolicy,
  keptHasDependents: a.keptHasDependents + b.keptHasDependents,
  keptLockedByOther: a.keptLockedByOther + b.keptLockedByOther,
  blockedByReference: a.blockedByReference + b.blockedByReference,
  keptPartlyRemoved: a.keptPartlyRemoved + b.keptPartlyRemoved,
  absent: a.absent + b.absent,
  failed: a.failed + b.failed,
})

/**
 * The durable state of one installation's uninstall. `pending` and `running`
 * block sync, restore and reinstall; `done`, `partial`, `failed` and `skipped`
 * are final for the operation (a retry starts a new one).
 */
export const templateUninstallStates = z.enum([
  "none",
  "pending",
  "running",
  "done",
  "partial",
  "failed",
  "skipped",
])
export type TemplateUninstallState = z.infer<typeof templateUninstallStates>

/** States in which an uninstall still owns the installation. */
export const TEMPLATE_UNINSTALL_ACTIVE_STATES: readonly TemplateUninstallState[] =
  ["pending", "running"]

/**
 * What happened to one tracked copy. `deleting` / `deletingModified` are the
 * Phase A tombstones (`deletingModified`: the installer had edited the copy,
 * `deletingUnverified`: edits of this kind can not be detected), each with its
 * own final and failed outcome so a retry keeps the flag.
 */
export const templateUninstallOutcomes = z.enum([
  "deleting",
  "deletingModified",
  "deletingUnverified",
  "deleted",
  "deletedModified",
  "deletedUnverified",
  "keptHasDependents",
  // A blocked committed copy a cancel gave back (detached, unfrozen).
  "keptPartlyRemoved",
  "keptShared",
  "keptLockedByOther",
  "absent",
  "failed",
  // A failed delete of a copy the installer had edited: kept apart so a retry
  // restores `deletingModified` and the final counts stay right.
  "failedModified",
  "failedUnverified",
  // Past the point of no return, but a reference (an unguarded writer's) now
  // points at the parent: it is not deleted. Each keeps its edit flag.
  "blockedByReference",
  "blockedByReferenceModified",
  "blockedByReferenceUnverified",
])
export type TemplateUninstallOutcome = z.infer<typeof templateUninstallOutcomes>

/** A claimed uninstall is `running` for at most this long without a heartbeat (database clock). */
export const TEMPLATE_UNINSTALL_LEASE_SECONDS = 300

/** The Phase A tombstones: copies an uninstall has doomed and not yet drained. */
export const TEMPLATE_UNINSTALL_TOMBSTONES: readonly TemplateUninstallOutcome[] =
  ["deleting", "deletingModified", "deletingUnverified"]

/** Rows an uninstall has doomed but not finished: tombstones and failures awaiting a retry. */
export const TEMPLATE_UNINSTALL_DOOMED: readonly TemplateUninstallOutcome[] = [
  ...TEMPLATE_UNINSTALL_TOMBSTONES,
  "failed",
  "failedModified",
  "failedUnverified",
  "blockedByReference",
  "blockedByReferenceModified",
  "blockedByReferenceUnverified",
]

type TombstoneOutcome = "deleting" | "deletingModified" | "deletingUnverified"

/** The final outcome of a tombstone once its delete committed. */
export const TEMPLATE_UNINSTALL_FINAL_OUTCOME: Record<
  TombstoneOutcome,
  TemplateUninstallOutcome
> = {
  deleting: "deleted",
  deletingModified: "deletedModified",
  deletingUnverified: "deletedUnverified",
}

/** The outcome of a tombstone whose delete failed: the edit flag survives for the retry. */
export const TEMPLATE_UNINSTALL_FAILED_OUTCOME: Record<
  TombstoneOutcome,
  TemplateUninstallOutcome
> = {
  deleting: "failed",
  deletingModified: "failedModified",
  deletingUnverified: "failedUnverified",
}

/** The outcome of a committed tombstone a reference now blocks; the edit flag survives. */
export const TEMPLATE_UNINSTALL_BLOCKED_OUTCOME: Record<
  TombstoneOutcome,
  TemplateUninstallOutcome
> = {
  deleting: "blockedByReference",
  deletingModified: "blockedByReferenceModified",
  deletingUnverified: "blockedByReferenceUnverified",
}

/** Failed / blocked outcome -> the tombstone a retry puts it back to. */
export const TEMPLATE_UNINSTALL_RETRY_TOMBSTONE: Partial<
  Record<TemplateUninstallOutcome, TombstoneOutcome>
> = {
  failed: "deleting",
  failedModified: "deletingModified",
  failedUnverified: "deletingUnverified",
  blockedByReference: "deleting",
  blockedByReferenceModified: "deletingModified",
  blockedByReferenceUnverified: "deletingUnverified",
}

export const isTemplateUninstallTombstone = (
  outcome: string | null | undefined,
): outcome is TombstoneOutcome =>
  outcome === "deleting" ||
  outcome === "deletingModified" ||
  outcome === "deletingUnverified"

/** The counter a persisted (non-tombstone) outcome increments. */
export const TEMPLATE_UNINSTALL_COUNT_KEY_BY_OUTCOME: Record<
  Exclude<TemplateUninstallOutcome, TombstoneOutcome>,
  keyof TemplateUninstallCounts
> = {
  deleted: "deleted",
  deletedModified: "deletedModified",
  deletedUnverified: "deletedUnverified",
  keptHasDependents: "keptHasDependents",
  keptPartlyRemoved: "keptPartlyRemoved",
  keptShared: "keptShared",
  keptLockedByOther: "keptLockedByOther",
  absent: "absent",
  failed: "failed",
  failedModified: "failed",
  failedUnverified: "failed",
  blockedByReference: "blockedByReference",
  blockedByReferenceModified: "blockedByReference",
  blockedByReferenceUnverified: "blockedByReference",
}

/**
 * A side effect an uninstall delete defers until after its transaction
 * commits (cache invalidation, inbox disconnect, ...). Captured with the
 * arguments it needs before the row is deleted, executed idempotently, then
 * cleared.
 */
export const templateUninstallEffectSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.string().nullable()).default({}),
})
export type TemplateUninstallEffect = z.infer<
  typeof templateUninstallEffectSchema
>

/** Why a sync ran: a publisher save, the installer's request, or a reinstall. */
export const templateSyncTriggers = z.enum([
  "autoUpdate",
  "manual",
  "reinstall",
])
export type TemplateSyncTrigger = z.infer<typeof templateSyncTriggers>

export const templateSyncStatuses = z.enum([
  "pending",
  "running",
  "completed",
  "partial",
  "failed",
  "skipped",
  "cancelled",
])
export type TemplateSyncStatus = z.infer<typeof templateSyncStatuses>

/**
 * `lockAll` / `lockedIds` are the per-item "View only" choice: a locked item
 * installs as a read-only copy. Absent means every item stays editable.
 */
export const templateResourceSelectionSchema = z.union([
  z.object({ mode: z.literal("all"), lockAll: z.boolean().optional() }),
  z.object({
    mode: z.literal("ids"),
    ids: z.array(z.string()),
    lockedIds: z.array(z.string()).optional(),
  }),
])
export type TemplateResourceSelection = z.infer<
  typeof templateResourceSelectionSchema
>

export const templateSelectionSchema = z.partialRecord(
  templateCategories,
  templateResourceSelectionSchema,
)
export type TemplateSelection = z.infer<typeof templateSelectionSchema>

// A partial record: a payload written before a category existed has no key for
// it, and `z.record(enum)` would reject it for the missing keys.
export const templateCategoryCountsSchema = z.partialRecord(
  templateCategories,
  z.number().int().nonnegative(),
)
export type TemplateCategoryCounts = z.infer<
  typeof templateCategoryCountsSchema
>

export const templatePermissionsSchema = z.object({
  allowEdit: z.boolean().default(true),
  allowDelete: z.boolean().default(true),
})
export type TemplatePermissions = z.infer<typeof templatePermissionsSchema>

export const templateWarningSchema = z.object({
  category: templateCategories,
  entityKind: z.string(),
  path: z.string(),
  value: z.string(),
})
export type TemplateWarning = z.infer<typeof templateWarningSchema>

/**
 * Every `resourceKind` a template-installed copy can be tracked under. One
 * source of truth: the lock guards, the lock policy and the adapters are all
 * typed against it, so a misspelt kind is a compile error instead of a lock
 * that silently never matches. The DB column stays `text`.
 */
export const templateResourceKinds = z.enum([
  "flow",
  "aiAgent",
  "aiFunction",
  "calendar",
  "integrationWebchat",
  "automatedResponse",
  "reflink",
  "trigger",
  "fbCommentAutomation",
  "product",
  "savedReply",
  "botField",
  "customField",
  "tag",
  "folder",
  "pipeline",
  "productCategory",
  "sequence",
  "aiMcpServer",
  "aiFile",
  "questionnaire",
  "couponTopic",
])
export type TemplateResourceKind = z.infer<typeof templateResourceKinds>

/** The outcome a delete that committed ends with (the edit flag survives). */
export const finalOutcomeOf = (
  outcome: TemplateUninstallOutcome | null,
): TemplateUninstallOutcome =>
  TEMPLATE_UNINSTALL_FINAL_OUTCOME[
    isTemplateUninstallTombstone(outcome) ? outcome : "deleting"
  ]

/** The outcome a failed delete ends with (the edit flag survives for the retry). */
export const failedOutcomeOf = (
  outcome: TemplateUninstallOutcome | null,
): TemplateUninstallOutcome =>
  TEMPLATE_UNINSTALL_FAILED_OUTCOME[
    isTemplateUninstallTombstone(outcome) ? outcome : "deleting"
  ]

/** The outcome a committed row ends with when a reference blocks its delete. */
export const blockedOutcomeOf = (
  outcome: TemplateUninstallOutcome | null,
): TemplateUninstallOutcome =>
  TEMPLATE_UNINSTALL_BLOCKED_OUTCOME[
    isTemplateUninstallTombstone(outcome) ? outcome : "deleting"
  ]
