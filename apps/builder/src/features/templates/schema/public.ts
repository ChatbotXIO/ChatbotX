import {
  templateCategories,
  templateInstallationStatuses,
  templatePermissionsSchema,
  templateResourceKinds,
  templateSelectionSchema,
  templateSyncStatuses,
  templateSyncTriggers,
  templateUninstallRequesters,
  templateUninstallStates,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { saveTemplateRequest } from "./mutation"

const PUBLISHER_REF_FORMAT = /^[0-9a-f]{16,64}$/

const templateId = zodBigintAsString().describe(
  "Template id. Get it from `templates.list`.",
)
const installationId = zodBigintAsString().describe(
  "Installation id. Get it from `templateInstallations.list` or `templateInstallations.install`.",
)
const shareToken = z
  .string()
  .trim()
  .min(1)
  .describe("The token in a `/t/{token}` share link.")
const shareLinkToken = shareToken

const categoryCounts = z
  .partialRecord(templateCategories, z.number())
  .describe("How many resources of each category the snapshot holds.")

export const publicTemplateResource = z.object({
  id: zodBigintAsString(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  publisherName: z.string().nullable(),
  youtubeVideoId: z.string().nullable(),
  testLink: z.string().nullable(),
  selection: templateSelectionSchema,
  defaultPermissions: templatePermissionsSchema,
  createInstallFolder: z.boolean(),
  defaultAutoUpdate: z.boolean(),
  shareEnabled: z.boolean(),
  shareExpiresAt: z.date().nullable(),
  categoryCounts,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const publicTemplateListItemResource = publicTemplateResource
  .omit({ selection: true })
  .extend({
    installCount: z
      .number()
      .describe(
        "Active installations (completed or partial) of this template.",
      ),
  })

export const listTemplatesPublicRequest = z.object({
  cursor: z
    .string()
    .max(512)
    .optional()
    .describe(
      "The `nextCursor` of the previous page. Omit for the first page.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size, 1 to 100 (default 100)."),
})

export const templateIdRequest = z.object({ id: templateId })

const saved = saveTemplateRequest.shape

export const createTemplatePublicRequest = z.object({
  name: saved.name.describe("Template name shown on the share page."),
  description: saved.description.describe(
    "Short text shown on the share page.",
  ),
  imageUrl: saved.imageUrl.describe(
    "Cover image: the `path` of an image file in this workspace's media library (get it from `mediaLibrary.listFiles`). Any other path is refused.",
  ),
  publisherName: saved.publisherName.describe(
    "Publisher name shown on the share page.",
  ),
  youtubeVideoId: saved.youtubeVideoId.describe(
    "11-character YouTube video id for the share page preview.",
  ),
  testLink: saved.testLink.describe(
    "URL where people can try the bot before installing.",
  ),
  selection: saved.selection.describe(
    'Per category `{mode: "all"}` or `{mode: "ids", ids, lockedIds?}`; `lockAll` or `lockedIds` make items view-only for installers. Get ids from `templates.listSelectableResources`.',
  ),
  defaultPermissions: saved.defaultPermissions.describe(
    "Whether installers may edit and delete what they install.",
  ),
  createInstallFolder: saved.createInstallFolder.describe(
    "Put everything an install creates into one new folder.",
  ),
  defaultAutoUpdate: saved.defaultAutoUpdate.describe(
    "Default for new installs: follow later saves of this template.",
  ),
})

export const updateTemplatePublicRequest = createTemplatePublicRequest.extend({
  id: templateId,
})

export const listSelectableResourcesPublicRequest = z.object({
  category: templateCategories.describe("Resource category to list."),
  keyword: z.string().trim().max(255).optional().describe("Name search."),
  cursor: z.string().optional().describe("`nextCursor` of the previous page."),
  limit: z.number().int().min(1).max(200).optional().describe("Page size."),
})

export const publicSelectableResourcesResponse = z.object({
  items: z.array(
    z.object({
      id: zodBigintAsString(),
      name: z.string(),
      folderName: z.string().optional(),
      badge: z
        .string()
        .optional()
        .describe("Extra label, e.g. the channel of a comment automation."),
    }),
  ),
  nextCursor: z.string().nullable(),
  total: z.number(),
  allIds: z.array(zodBigintAsString()).optional(),
})

export const previewTemplateDependenciesPublicRequest = z.object({
  selection: saved.selection.describe(
    "The same `selection` you would give `templates.create`.",
  ),
})

export const templateDependenciesResponse = z.object({
  includedDependencies: z
    .array(
      z.object({
        category: templateCategories,
        sourceId: z
          .string()
          .describe(
            "Id of the resource in this workspace; it was not selected but is pulled in.",
          ),
        name: z
          .string()
          .describe(
            "Display name of the pulled-in resource (a keyword's words, a saved reply's shortcut).",
          ),
      }),
    )
    .describe(
      "Resources the template takes along because a selected one needs them (a flow's sequence, a reflink's flow, ...).",
    ),
  manifests: z
    .array(
      z.object({
        kind: z.string().describe("`tags`, `customFields`, `folders`, ..."),
        count: z.number(),
        names: z.array(z.string()),
      }),
    )
    .describe("Tags, custom fields and the like the template ships."),
  droppedReferenceCount: z
    .number()
    .describe(
      "References to resources that no longer exist; the snapshot leaves them out.",
    ),
})

export const listLockedResourcesPublicRequest = z.object({
  resourceKind: templateResourceKinds.describe(
    "Kind of resource: `flow`, `aiAgent`, `automatedResponse` (keywords), `trigger`, `sequence`, `product`, ...",
  ),
  resourceIds: z
    .array(zodBigintAsString())
    .min(1)
    .max(200)
    .describe(
      "Ids of resources of that kind, from its own list operation (at most 200).",
    ),
})

export const listLockedResourcesResponse = z.object({
  lockedIds: z
    .array(z.string())
    .describe(
      "The given ids that were installed from a view-only template: their content cannot be edited (the edit is refused with `templateAllowEditViolation`).",
    ),
})

export const templateLinkResponse = z.object({
  url: z
    .string()
    .describe("Share link; anyone signed in to the same tenant can open it."),
  shareEnabled: z.boolean(),
  shareExpiresAt: z.date().nullable(),
})

export const updateTemplateSharePublicRequest = z.object({
  id: templateId,
  enabled: z.boolean().describe("Whether the share link works."),
  expiresAt: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .describe(
      "ISO date-time after which the link stops working; `null` removes the expiry; omit to keep the current one.",
    ),
})

export const templateAnalyticsResponse = z.object({
  byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
  activeAutoUpdate: z
    .number()
    .describe("Active installations that follow auto-update."),
  totalInstallEvents: z.number(),
  byVersion: z
    .array(z.object({ version: z.number(), count: z.number() }))
    .describe("Active installations grouped by the template version they run."),
})

const predictedAction = z.enum(["create", "reuse", "rename", "bind", "unbound"])

const predictedCollision = z.object({
  manifest: z
    .string()
    .describe(
      "Kind of item: `tags`, `customFields`, `botFields`, `folders`, `productCategories`, `pipelines` or `inboxes`.",
    ),
  sourceId: z.string().describe("The item's id inside the template."),
  name: z.string(),
  action: predictedAction.describe(
    "`create` a new one, `reuse` the same-named one that exists, `rename` (a custom or bot field whose name is taken by another type), `bind` an inbox you chose, `unbound` an inbox left unchosen.",
  ),
  targetId: z
    .string()
    .optional()
    .describe("The existing item that is reused or bound, when there is one."),
})

const collisionSummary = z
  .record(predictedAction, z.number())
  .describe("How many items fall under each action.")

export const previewTemplatePublicRequest = z.object({ id: shareLinkToken })

export const publicTemplatePreviewResponse = z.discriminatedUnion(
  "installable",
  [
    z.object({
      installable: z.literal(true),
      template: z.object({
        name: z.string(),
        description: z.string().nullable(),
        imageUrl: z.string().nullable(),
        publisherName: z.string().nullable(),
        youtubeVideoId: z.string().nullable(),
        testLink: z.string().nullable(),
        categoryCounts,
      }),
      requiredInboxes: z
        .array(
          z.object({
            sourceId: zodBigintAsString().describe(
              "The template's inbox id: the key of `inboxBindings`.",
            ),
            channelType: z.string().describe("Channel of that inbox."),
            name: z.string().describe("Name of that inbox in the source."),
          }),
        )
        .describe(
          "Inboxes the template was built around; bind your own with `inboxBindings` on install. Empty when the template needs none.",
        ),
      requiredChannels: z
        .array(z.string())
        .describe("The distinct channels of `requiredInboxes`."),
      collisions: z
        .array(predictedCollision)
        .describe(
          "What an install would do to the tags, custom fields, folders, product categories, pipelines and inboxes the template carries, given what this workspace already has. Predictions only; nothing is written. Inbox predictions assume no inbox bindings (this preview cannot take them); `templateInstallations.install` with `inboxBindings` decides the final binding.",
        ),
      collisionSummary,
      existingInstallation: z
        .object({ id: zodBigintAsString(), status: z.string() })
        .nullable()
        .describe(
          "The latest installation of this template in the workspace, if any.",
        ),
      publisherUninstallDisclosure: z
        .object({
          version: z
            .number()
            .describe("The disclosure version an accepted grant records."),
          publisherSees: z.array(z.string()),
          publisherCan: z.array(z.string()),
          uninstallDeletes: z.string(),
        })
        .describe(
          "What `acceptPublisherUninstall` on `templateInstallations.install` allows. Show it to the installer before installing: the publisher sees this workspace's name and the install and uninstall counts, and can uninstall the template, which deletes what it created.",
        ),
    }),
    z.object({
      installable: z.literal(false),
      reason: z
        .string()
        .describe(
          "Why: `templateShareDisabled`, `templateCrossTenantInstall`, `templateCategoryPermissionDenied`, `templateManagePermissionDenied` (the link is fine but a `read_only` token can not install) or `templatePayloadIncompatible`.",
        ),
    }),
  ],
)

export const installTemplatePublicRequest = z.object({
  shareToken,
  inboxBindings: z
    .record(zodBigintAsString(), zodBigintAsString())
    .optional()
    .describe(
      "Which of your inboxes stands in for each inbox the template was built around: `{ templateInboxId: yourInboxId }`. The template inbox ids and their channels are `requiredInboxes` of `templatePreviews.get`; get your inbox ids from `inboxes.list` (same channel, connected). An automation whose inbox is not bound installs inactive. Ignored when this template is already being installed (the running install keeps its own bindings); a failed install keeps its bindings on retry, so start a new install to change them.",
    ),
  allowDuplicate: z
    .boolean()
    .optional()
    .describe(
      "Install a separate copy when the template is already installed in this workspace. Without it, the installed copy is updated in place to the newest version (see `syncId`).",
    ),
  acceptPublisherUninstall: z
    .boolean()
    .optional()
    .describe(
      "Let the publisher see this workspace's name in their install list and uninstall the template from it. Defaults to what the installer chose before for this template, else true. Say so to the installer: the publisher then sees the workspace name and can uninstall the template, which deletes everything the template created, including copies the installer edited (anything built on top of a copy is kept).",
    ),
  autoUpdate: z
    .boolean()
    .optional()
    .describe(
      "When updating an installed copy in place: follow later saves of the template. Defaults to the template's own default.",
    ),
})

export const installTemplatePublicResponse = z.object({
  installationId: zodBigintAsString().describe(
    "Poll `templateInstallations.get` until the status is `completed`, `partial` or `failed`.",
  ),
  syncId: zodBigintAsString()
    .optional()
    .describe(
      "Present when the template was already installed and that copy is being updated in place; poll `templateInstallations.getSync`.",
    ),
})

export const listInstallationsPublicRequest = z.object({
  status: z
    .enum(templateInstallationStatuses.options)
    .optional()
    .describe("Only installations in this status."),
  activeOnly: z
    .boolean()
    .optional()
    .describe("Only installs still in flight (`pending` or `installing`)."),
  cursor: zodBigintAsString()
    .optional()
    .describe("`nextCursor` of the previous page."),
  limit: z.number().int().min(1).max(100).optional().describe("Page size."),
})

const installationListItem = z.object({
  id: zodBigintAsString(),
  templateName: z.string(),
  status: z.enum(templateInstallationStatuses.options),
  errorCode: z.string().nullable(),
  resourceCount: z.number(),
  warningCount: z.number(),
  autoUpdate: z.boolean(),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
  uninstallState: z
    .enum(templateUninstallStates.options)
    .describe(
      "`pending` / `running` while an uninstall runs (poll until it is not); `done` once uninstalled; `partial`, `failed` and `skipped` can be retried with `templateInstallations.uninstall`.",
    ),
})

const uninstallCounts = z.object({
  deleted: z
    .number()
    .describe(
      "Copies that are (or were) deleted, edited ones included. Everything the template created is deleted unless it is listed as kept.",
    ),
  deletedModified: z
    .number()
    .describe(
      "Of `deleted`: copies the installer had edited. Their edits are lost and can not be restored; say so before confirming.",
    ),
  deletedUnverified: z
    .number()
    .describe(
      "Of `deleted`: copies of a kind whose edits cannot be detected, so it is unknown whether work was lost. Say that, not that edits are lost.",
    ),
  keptShared: z
    .number()
    .describe(
      "Tags, fields, folders and the like, which may be used elsewhere; kept.",
    ),
  keptHasDependents: z
    .number()
    .describe(
      "Copies kept because deleting them would destroy or null out something the installer created that is not itself deleted (a broadcast, a ref link, a deal, an order line, a channel setting that points at a copied flow...).",
    ),
  blockedByReference: z
    .number()
    .describe(
      "Copies already committed to deletion that something the installer created now points at (written around the reference guards): not deleted, so that data stays. Remove the reference, then request the uninstall again to finish them.",
    ),
  keptPartlyRemoved: z
    .number()
    .describe(
      "Copies that were blocked by a reference after the point of no return and that a cancel gave back: kept and detached from the installation. Kinds without history (products, keywords, ...) are active again; kinds whose history and duplicate-protection data were removed (flows, triggers, sequences, ...) stay inactive: review before switching them on.",
    ),
  keptLockedByOther: z
    .number()
    .describe(
      "Copies kept because another template installation still locks them against deletion.",
    ),
  absent: z
    .number()
    .describe("Copies that were already gone when the uninstall reached them."),
  failed: z
    .number()
    .describe(
      "Copies whose delete failed. Request the uninstall again to retry only these.",
    ),
  keptModified: z
    .number()
    .describe(
      "Legacy: copies kept by the earlier conservative uninstall. Always 0 for new uninstalls.",
    ),
  keptByPolicy: z
    .number()
    .describe(
      "Legacy: kinds the earlier conservative uninstall did not delete. Always 0 for new uninstalls.",
    ),
})

const uninstallStateEnum = z.enum(templateUninstallStates.options)

const installationsPageItem = installationListItem.extend({
  updateAvailable: z
    .boolean()
    .describe(
      "The template has a newer version than this copy; false once the template was deleted. Bring it up to date with `templateInstallations.sync`.",
    ),
  uninstalledBy: z
    .enum(templateUninstallRequesters.options)
    .nullable()
    .describe(
      "Who uninstalled the template; null unless `status` is `uninstalled`.",
    ),
  uninstallCounts: uninstallCounts
    .nullable()
    .describe(
      "What the uninstall did with the copies; null unless uninstalled.",
    ),
})

export const listInstallationsPublicResponse = z.object({
  items: z.array(installationsPageItem),
  nextCursor: z.string().nullable(),
})

export const installationIdRequest = z.object({ id: installationId })

export const installationDetailResponse = installationListItem.extend({
  attempts: z.number(),
  claimedAt: z
    .date()
    .nullable()
    .describe(
      "When the latest install attempt started; earlier attempts are not kept.",
    ),
  sourceVersion: z
    .number()
    .describe("The template version this copy was last brought to."),
  updateAvailable: z
    .boolean()
    .describe(
      "The template has a newer version. Bring the copy up to date with `templateInstallations.sync`.",
    ),
  lastSyncedAt: z.date().nullable(),
  syncInProgress: z.boolean(),
  uninstallState: z
    .enum(templateUninstallStates.options)
    .describe("See `templateInstallations.list`."),
  uninstallErrorCode: z
    .string()
    .nullable()
    .describe("Why the latest uninstall failed or was skipped."),
  uninstallCounts: uninstallCounts
    .nullable()
    .describe(
      "What the latest uninstall did, by outcome; null until it finishes.",
    ),
  installedByName: z.string().nullable(),
  warnings: z
    .array(
      z.object({
        category: z.string(),
        code: z.string(),
        path: z.string(),
        value: z.string(),
      }),
    )
    .describe("At most 200 warnings; `warningSummary` counts them all."),
  warningSummary: z.array(z.object({ code: z.string(), count: z.number() })),
})

export const listInstallationResourcesRequest = z.object({
  id: installationId,
  cursor: zodBigintAsString()
    .optional()
    .describe("`nextCursor` of the previous page."),
  limit: z.number().int().min(1).max(200).optional().describe("Page size."),
})

export const listInstallationResourcesResponse = z.object({
  items: z.array(
    z.object({
      id: zodBigintAsString(),
      category: z.string(),
      resourceKind: z.string(),
      resourceId: zodBigintAsString(),
      label: z
        .string()
        .nullable()
        .describe("Display name; null when the resource was deleted."),
      created: z
        .boolean()
        .describe(
          "False when the install reused a resource that already existed.",
        ),
      locked: z
        .boolean()
        .describe("View only: the publisher disallowed editing."),
    }),
  ),
  nextCursor: z.string().nullable(),
})

export const updateInstallationPublicRequest = z.object({
  id: installationId,
  autoUpdate: z
    .boolean()
    .optional()
    .describe("Follow later saves of the template automatically."),
  publisherUninstallGrant: z
    .boolean()
    .optional()
    .describe(
      "Let the publisher see this workspace's name and uninstall the template from it. Their uninstall deletes everything the template created, including copies the installer edited.",
    ),
})

export const syncInstallationPublicRequest = z.object({
  id: installationId,
})

export const syncInstallationPublicResponse = z.object({
  syncId: zodBigintAsString().describe(
    "Poll `templateInstallations.getSync` until the status is `completed`, `partial`, `failed` or `skipped`.",
  ),
})

const syncId = zodBigintAsString().describe(
  "Sync id. Get it from `templateInstallations.listSyncs` or `templateInstallations.sync`.",
)

export const getSyncPublicRequest = z.object({
  id: installationId,
  syncId,
})

const syncSummary = z.object({
  id: zodBigintAsString(),
  status: z.enum(templateSyncStatuses.options),
  trigger: z.enum(templateSyncTriggers.options),
  requestedVersion: z.number(),
  fromVersion: z.number().nullable(),
  appliedVersion: z
    .number()
    .nullable()
    .describe("Can be newer than `requestedVersion` when saves queued up."),
  errorCode: z.string().nullable(),
  counts: z
    .object({
      created: z.number(),
      updated: z.number(),
      detached: z.number(),
      overwrittenModified: z.number(),
      notUpdatable: z.number(),
    })
    .nullable(),
  createdAt: z.date(),
  finishedAt: z.date().nullable(),
})

export const listSyncsPublicResponse = z.object({
  items: z.array(syncSummary),
})

export const getSyncPublicResponse = syncSummary.extend({
  warnings: z.array(
    z.object({
      category: z.string(),
      code: z.string(),
      path: z.string(),
      value: z.string(),
    }),
  ),
  backups: z
    .array(
      z.object({
        id: zodBigintAsString().describe(
          "Pass to `templateInstallations.restoreBackup`.",
        ),
        resourceKind: z.string(),
        resourceId: zodBigintAsString(),
        byteSize: z.number(),
      }),
    )
    .describe(
      "What this sync overwrote on copies the installer had edited; restore one to get the edit back.",
    ),
})

export const restoreBackupPublicRequest = z.object({
  id: installationId,
  backupId: zodBigintAsString().describe(
    "Backup id. Get it from `templateInstallations.getSync`.",
  ),
})

export const listTemplateInstallersPublicRequest = z.object({
  id: templateId,
  search: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe("Workspace name search."),
  cursor: z.string().optional().describe("`nextCursor` of the previous page."),
  limit: z.number().int().min(1).max(100).optional().describe("Page size."),
})

export const listTemplateInstallersPublicResponse = z.object({
  items: z.array(
    z.object({
      publisherRef: z
        .string()
        .describe(
          "Opaque reference to one installer; stable across their reinstalls.",
        ),
      workspaceName: z
        .string()
        .nullable()
        .describe(
          "Null when the installer did not let the publisher see the workspace name.",
        ),
      installCount: z
        .number()
        .describe(
          "Install events of copies still installed (0 once uninstalled).",
        ),
      totalInstallEvents: z
        .number()
        .describe("Install events ever, uninstalled copies included."),
      lastInstalledAt: z.date().nullable(),
      oldestVersion: z
        .number()
        .nullable()
        .describe(
          "The oldest template version among their copies; compare with the template's newest.",
        ),
      autoUpdate: z.boolean(),
      active: z.boolean().describe("At least one copy is still installed."),
      uninstallState: uninstallStateEnum.describe(
        "State of the latest uninstall of this installer: `pending` and `running` are in progress, `done`, `partial` (retry with `templates.uninstallInstaller`), `failed` and `skipped` (their workspace was blocked) are final, `none` when never requested.",
      ),
      eligibleForUninstall: z
        .boolean()
        .describe(
          "Every active copy granted the publisher the right to uninstall.",
        ),
      uninstallCounts: uninstallCounts
        .nullable()
        .describe(
          "What the latest finished uninstall did with this installer's copies (counts only); null before one finishes.",
        ),
    }),
  ),
  nextCursor: z.string().nullable(),
})

export const uninstallInstallationPublicResponse = uninstallCounts

export const uninstallRequestedInstallationPublicResponse = z.object({
  installationId: z.string(),
  operationId: z.string().describe("The uninstall operation, one per request."),
  uninstallState: uninstallStateEnum.describe(
    "`pending` once accepted; follow it with `templateInstallations.get` (`uninstallState`).",
  ),
})

export const publisherInstallerRequest = z.object({
  id: templateId,
  installerId: z
    .string()
    .trim()
    .regex(PUBLISHER_REF_FORMAT)
    .describe(
      "Opaque installer reference: the `publisherRef` of an item of `templates.listInstallers`.",
    ),
})

export const cancelUninstallPublicResponse = z.object({
  installationId: z.string(),
  restored: z
    .number()
    .describe(
      "Copies that were still waiting to be deleted and were given back (untombstoned, producers restored). Copies already deleted stay deleted.",
    ),
  alreadyCommitted: z
    .number()
    .describe(
      "Copies already past the point of no return (committed to deletion): they are not given back and finish deleting; request the uninstall again if it stopped.",
    ),
  keptPartlyRemoved: z
    .number()
    .describe(
      "Committed copies that a reference had blocked: given back as kept and detached from the installation. Their history and duplicate-protection data may already be removed; review before switching them on.",
    ),
  keptInactiveForReview: z
    .number()
    .describe(
      "Of `keptPartlyRemoved`: copies of kinds with an on/off switch (flows, triggers, sequences, comment automations, ...) whose history and duplicate-protection data were removed. They are left INACTIVE and nothing switches them on later; review before switching them on.",
    ),
  keptHistoryRemoved: z
    .number()
    .describe(
      "Of `keptPartlyRemoved`: copies of kinds without an on/off switch (ref links, pipelines, AI files, ...) whose history was removed. Nothing was left inactive; AI files are queued for reindexing.",
    ),
})

export const uninstallRequestedInstallerPublicResponse = z.object({
  publisherRef: z.string(),
  uninstallState: uninstallStateEnum.describe(
    "`pending` once accepted; follow it with `templates.listInstallers` (`uninstallState`).",
  ),
})

export const uninstallInstallerPublicResponse = z.object({
  installations: z
    .number()
    .describe("How many copies of the template that installer holds."),
  counts: uninstallCounts,
})
