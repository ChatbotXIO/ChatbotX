import { db } from "@chatbotx.io/database/client"
import type {
  InboundWebhookAction,
  InboundWebhookFieldMapping,
  InboundWebhookIdentifier,
  InboundWebhookInboxResolution,
} from "@chatbotx.io/database/partials"
import type { inboundWebhookModel } from "@chatbotx.io/database/schema"
import { classifyMappedTarget } from "../../inbound-webhook/extract"
import { inboundWebhookService } from "../../inbound-webhook/service"
import { collectResourceDependencies } from "../manifest-references"
import { remapEntryReferences } from "./entry-references"
import {
  makeCollector,
  recordCopy,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateInboundWebhookEntry = {
  sourceId: string
  name: string
  identifiers: InboundWebhookIdentifier[]
  /** `target` of a custom-field mapping is still the source workspace's field id. */
  fieldMappings: InboundWebhookFieldMapping[]
  /** Trigger-style actions; references are still the source workspace's ids. */
  actions: InboundWebhookAction[]
  /** `inbox` mode names a source inbox; `payload` mode holds no ids; `null` = never configured. */
  inboxResolution: InboundWebhookInboxResolution | null
}

/**
 * What a template does with every column of `InboundWebhook` (a new column
 * fails to compile until it is classified here, then written in `insert`).
 * `InboundWebhookRequest` is the webhook's delivery log and is never copied.
 */
export const INBOUND_WEBHOOK_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  name: "copy",
  // Always installed off: a webhook only receives once the installer has
  // looked at its config and chosen to switch it on.
  active: "reset",
  // The capability in the endpoint URL: every copy mints its own.
  token: "reset",
  inboxResolution: "rebind",
  identifiers: "copy",
  fieldMappings: "reference",
  actions: "reference",
  // A payload the source's own sender produced: contact data, never shipped.
  sampleJson: "drop",
  requestCount: "reset",
} as const satisfies Record<
  keyof typeof inboundWebhookModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/** What an action can name that travels or is found by name in the target. */
const ACTION_REMAP_KINDS = ["flow", "tag", "customField", "botField"] as const

/** The custom-field ids a webhook's mappings write to (system fields have no id). */
const customFieldTargets = (
  mappings: readonly InboundWebhookFieldMapping[],
): string[] =>
  mappings
    .filter(({ target }) => classifyMappedTarget(target) === "customField")
    .map(({ target }) => target)

/**
 * Mappings pointing at one of the installer's own custom fields. A system
 * field stays as is; a custom field no map resolved is warned about and the
 * mapping dropped, so a copy never writes to (or names) the source workspace's id.
 */
const remapFieldMappings = (
  ctx: TemplateInstallContext,
  entry: TemplateInboundWebhookEntry,
): InboundWebhookFieldMapping[] =>
  entry.fieldMappings.flatMap((mapping, index) => {
    if (classifyMappedTarget(mapping.target) !== "customField") {
      return [mapping]
    }
    const target = ctx.idMaps.customField?.get(mapping.target)
    if (target) {
      return [{ ...mapping, target }]
    }
    ctx.warn({
      category: "inboundWebhooks",
      entityKind: "customField",
      path: `inboundWebhooks.${entry.sourceId}.fieldMappings.${index}.target`,
      value: mapping.target,
    })
    return []
  })

/**
 * An inbox rule that names an inbox is re-bound to the installer's own; one
 * whose inbox was not bound cannot be pointed anywhere sensible, so the
 * webhook is installed without a rule (it cannot be switched on until the
 * installer chooses one) instead of keeping the source's inbox id. A rule read
 * from the payload holds no id and travels as is.
 */
const resolveInboxResolution = (
  ctx: TemplateInstallContext,
  entry: TemplateInboundWebhookEntry,
): InboundWebhookInboxResolution | null => {
  const rule = entry.inboxResolution
  if (rule?.mode !== "inbox") {
    return rule
  }
  const inboxId = ctx.idMaps.inbox?.get(rule.inboxId)
  if (inboxId) {
    return { mode: "inbox", inboxId }
  }
  ctx.warn({
    category: "inboundWebhooks",
    entityKind: "inboxBindingRequired",
    path: `inboundWebhooks.${entry.sourceId}.inboxResolution`,
    value: rule.inboxId,
  })
  return null
}

/**
 * Inbound webhooks ship their name, contact identifiers, field mappings and
 * actions. What identifies or feeds the source never does: the endpoint token
 * (every copy mints its own), the sample payload, the request log and counter.
 * A copy is always installed switched off, and one whose inbox rule names an
 * inbox that was not bound is installed without a rule.
 *
 * The workspace holds at most 100 webhooks: an install that would exceed the
 * cap skips the rest with a warning (decided under the same per-workspace lock
 * `create` takes, so two installs cannot both fit the last slot).
 */
export const inboundWebhooksAdapter: ResourceAdapter<TemplateInboundWebhookEntry> =
  {
    category: "inboundWebhooks",
    providesKinds: [],
    consumesKinds: [...ACTION_REMAP_KINDS, "inbox"],
    deferredKinds: [],
    trackedKind: "inboundWebhook",
    folderTypes: [],
    minFormatVersion: 3,
    sync: updateNotSupported("inboundWebhooks"),

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateInboundWebhookEntry[],
    ): Promise<PatchTask[]> {
      for (const entry of entries) {
        const actions = await remapEntryReferences(ctx, {
          category: "inboundWebhooks",
          sourceId: entry.sourceId,
          field: "actions",
          value: entry.actions,
          kinds: ACTION_REMAP_KINDS,
        })
        const created = await inboundWebhookService.insertInTx(ctx.tx, {
          workspaceId: ctx.workspaceId,
          name: entry.name,
          config: {
            inboxResolution: resolveInboxResolution(ctx, entry),
            identifiers: entry.identifiers,
            fieldMappings: remapFieldMappings(ctx, entry),
            actions,
          },
        })
        if (!created) {
          ctx.warn({
            category: "inboundWebhooks",
            entityKind: "inboundWebhookLimitReached",
            path: `inboundWebhooks.${entry.sourceId}`,
            value: entry.sourceId,
          })
          continue
        }
        recordCopy(ctx, {
          category: "inboundWebhooks",
          resourceKind: "inboundWebhook",
          sourceId: entry.sourceId,
          resourceId: created.id,
        })
      }
      return [] satisfies PatchTask[]
    },

    collector: makeCollector({
      findIds: (query) =>
        db.query.inboundWebhookModel.findMany({
          where: scopedWhere(query),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.inboundWebhookModel.findMany({
          where: scopedWhere({ workspaceId, ids }),
          columns: {
            id: true,
            name: true,
            identifiers: true,
            fieldMappings: true,
            actions: true,
            inboxResolution: true,
          },
        })
        return {
          entries: rows.map(
            (row): TemplateInboundWebhookEntry => ({
              sourceId: row.id,
              name: row.name,
              identifiers: row.identifiers,
              fieldMappings: row.fieldMappings,
              actions: row.actions,
              inboxResolution: row.inboxResolution,
            }),
          ),
          inboxIds: rows.flatMap(({ inboxResolution }) =>
            inboxResolution?.mode === "inbox" ? [inboxResolution.inboxId] : [],
          ),
          // The mapping `target` key is too generic for the reference
          // registry, so the fields it names are reported here.
          customFieldIds: rows.flatMap((row) =>
            customFieldTargets(row.fieldMappings),
          ),
          hardDependencies: rows.flatMap((row) =>
            collectResourceDependencies(row.actions),
          ),
        }
      },
    }),
  }
