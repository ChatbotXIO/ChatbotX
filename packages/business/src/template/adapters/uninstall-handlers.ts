import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import { PIPELINE_LIMITS } from "@chatbotx.io/database/partials"
import {
  pipelineActivityRepository,
  savedReplyImageRepository,
  templateUninstallRepository,
} from "@chatbotx.io/database/repositories"
import {
  aiFileModel,
  appointmentCalendarModel,
  automatedResponseModel,
  commentAutomationModel,
  flowModel,
  integrationWebchatModel,
  productModel,
  sequenceModel,
  triggerModel,
} from "@chatbotx.io/database/schema"
import { and, eq, inArray, sql } from "drizzle-orm"
import { aiAgentService } from "../../ai-agent/service"
import { aiFileService } from "../../ai-file/service"
import { aiFunctionService } from "../../ai-function/service"
import { aiMcpServerService } from "../../ai-mcp-server/service"
import { appointmentCalendarService } from "../../appointment-calendar/service"
import { automatedResponseService } from "../../automated-response/service"
import { commentAutomationService } from "../../comment-automation/service"
import { couponService } from "../../coupon/service"
import { flowService } from "../../flow/service"
import { integrationWebchatService } from "../../integration-webchat/service"
import { pipelineService } from "../../pipeline/service"
import { productService } from "../../product/service"
import { questionnaireService } from "../../questionnaire/service"
import { reflinkService } from "../../reflink/service"
import { savedReplyService } from "../../saved-reply/service"
import { sequenceService } from "../../sequence/service"
import { triggerService } from "../../trigger/service"
import type { ManifestKind } from "./manifests/kinds"
import type { ResourceUninstallHandler } from "./types"
import {
  deleteChildBatch,
  deleteResult,
  drainInOrder,
  effect,
  flagHandlers,
  noDependents,
  noFreeze,
  noUnfreeze,
  probedDependents,
  sameEffects,
  softDeleteChildBatch,
  withProbedKind,
} from "./uninstall-kit"

const NO_HEAVY_CHILDREN: readonly string[] = []

/** Flows: stop, then delete; analytics sessions are soft-deleted, Meta welcome flows cleaned after commit. */
/**
 * ONE rule for every kind: a row has a point of no return. Under the
 * tpl-res locks and the parent `FOR UPDATE`, the batch probes the row's
 * dependents once; a holder keeps the row whole (nothing was drained), no
 * holder commits it (`uninstallDrainStartedAt`). From then on every child is
 * drained in bounded, workspace-scoped batches (no history/content split, no
 * caps), the parent is deleted last, and a re-probe at that delete (writers
 * that bypass `assertReferencable`) fails the row as `blockedByReference`
 * rather than cascade or null out installer data.
 */

const flowHandler: ResourceUninstallHandler = {
  heavyChildren: ["FlowRun", "FlowAnalyticsSession", "FlowVersion"],
  drainHeavyChildren: async (tx, ids, ctx) =>
    await drainInOrder([
      () =>
        deleteChildBatch(tx, {
          table: "FlowRun",
          parentColumn: "flowId",
          parentIds: ids,
          workspaceId: ctx.workspaceId,
        }),
      () =>
        softDeleteChildBatch(tx, {
          table: "FlowAnalyticsSession",
          parentColumn: "flowId",
          parentIds: ids,
          workspaceId: ctx.workspaceId,
        }),
      () =>
        deleteChildBatch(tx, {
          table: "FlowVersion",
          parentColumn: "flowId",
          parentIds: ids,
          workspaceId: ctx.workspaceId,
        }),
    ]),
  ...flagHandlers(flowModel, { key: "active", frozen: false }),
  protectedDependents: probedDependents("flow"),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      await flowService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
      (deleted) =>
        new Map(
          deleted.map((id) => [
            id,
            [
              effect("flow.welcomeCleanup", {
                workspaceId: ctx.workspaceId,
                flowId: id,
              }),
            ],
          ]),
        ),
    ),
}

const triggerHandler: ResourceUninstallHandler = {
  heavyChildren: ["TriggerExecution", "TriggerStat", "TriggerContactHistory"],
  drainHeavyChildren: async (tx, ids, ctx) =>
    await drainInOrder(
      ["TriggerExecution", "TriggerStat", "TriggerContactHistory"].map(
        (table) => () =>
          deleteChildBatch(tx, {
            table,
            parentColumn: "triggerId",
            parentIds: ids,
            workspaceId: ctx.workspaceId,
          }),
      ),
    ),
  ...flagHandlers(
    triggerModel,
    { key: "active", frozen: false },
    (workspaceId) => [effect("trigger.invalidateCache", { workspaceId })],
  ),
  protectedDependents: probedDependents("trigger"),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      await triggerService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
      (deleted) =>
        sameEffects(deleted, [
          effect("trigger.invalidateCache", { workspaceId: ctx.workspaceId }),
        ]),
    ),
}

/** Keywords of either `type` go through the same delete: the row's own `type` is never assumed. */
const keywordHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  ...flagHandlers(
    automatedResponseModel,
    { key: "status", frozen: false },
    (workspaceId) => [
      effect("automatedResponse.invalidateCache", { workspaceId }),
    ],
  ),
  // A contact filter or an ads rule that points at the keyword keeps it, as
  // does any registry or column slot (a keyword is referenced from conditions).
  protectedDependents: withProbedKind(
    "automatedResponse",
    async (tx, ids, deletingSet, scope) => {
      const referenced =
        await templateUninstallRepository.findReferencedKeywordIds(
          { workspaceId: scope.workspaceId, ids: [...ids] },
          tx,
        )
      for (const id of await probedDependents("automatedResponse")(
        tx,
        ids,
        deletingSet,
        scope,
      )) {
        referenced.add(id)
      }
      return referenced
    },
  ),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      await automatedResponseService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
      (deleted) =>
        sameEffects(deleted, [
          effect("automatedResponse.invalidateCache", {
            workspaceId: ctx.workspaceId,
          }),
        ]),
    ),
}

const sequenceHandler: ResourceUninstallHandler = {
  heavyChildren: ["SequenceDispatch", "ContactOnSequence"],
  // Past the point of no return every enrollment and dispatch goes, in
  // bounded batches (both partitioned by workspace: the predicate prunes).
  drainHeavyChildren: async (tx, ids, ctx) =>
    await drainInOrder(
      ["SequenceDispatch", "ContactOnSequence"].map(
        (table) => () =>
          deleteChildBatch(tx, {
            table,
            primaryKey: ["id", "workspaceId"],
            parentColumn: "sequenceId",
            parentIds: ids,
            workspaceId: ctx.workspaceId,
          }),
      ),
    ),
  ...flagHandlers(sequenceModel, { key: "active", frozen: false }),
  // A flow's subscribe step (sequenceId in its nodes) keeps the sequence.
  protectedDependents: probedDependents("sequence"),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      await sequenceService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
    ),
}

/** Calendars keep their soft delete. */
const calendarHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  ...flagHandlers(appointmentCalendarModel, { key: "active", frozen: false }),
  protectedDependents: probedDependents("calendar"),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      await appointmentCalendarService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
    ),
}

/**
 * The webchat's inbox is disconnected after commit by a recorded effect
 * (`webchat.disconnectInbox`, idempotent), like the other post-commit work:
 * the delete itself only touches the webchat row, and a crash between commit
 * and the disconnect is re-driven by the sweep instead of lost.
 */
const webchatHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  ...flagHandlers(integrationWebchatModel, { key: "enable", frozen: false }),
  protectedDependents: noDependents,
  uninstallDelete: async (tx, ids, ctx) => {
    // Read before the delete: the inbox id is gone with the row.
    const rows = await tx.query.integrationWebchatModel.findMany({
      where: { workspaceId: ctx.workspaceId, id: { in: [...ids] } },
      columns: { id: true, inboxId: true },
    })
    const inboxIdByWebchat = new Map(rows.map((row) => [row.id, row.inboxId]))
    return deleteResult(
      ids,
      await integrationWebchatService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
      (deleted) =>
        new Map(
          deleted.flatMap((id) => {
            const inboxId = inboxIdByWebchat.get(id)
            return inboxId
              ? [
                  [
                    id,
                    [
                      effect("webchat.disconnectInbox", {
                        workspaceId: ctx.workspaceId,
                        inboxId,
                      }),
                    ],
                  ] as const,
                ]
              : []
          }),
        ),
    )
  },
}

/** Every channel's automation lives in one table; the `type` is read from the row, never assumed. */
const commentAutomationHandler: ResourceUninstallHandler = {
  // The reply rows record which comments were already answered (dedupe): live.
  heavyChildren: [
    "CommentAutomationEvent",
    "CommentAutomationReply",
    "CommentAutomationMiss",
  ],
  drainHeavyChildren: async (tx, ids, ctx) =>
    await drainInOrder(
      [
        "CommentAutomationEvent",
        "CommentAutomationReply",
        "CommentAutomationMiss",
      ].map(
        (table) => () =>
          deleteChildBatch(tx, {
            table,
            parentColumn: "automationId",
            parentIds: ids,
            workspaceId: ctx.workspaceId,
          }),
      ),
    ),
  ...flagHandlers(commentAutomationModel, { key: "isActive", frozen: false }),
  protectedDependents: noDependents,
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      await commentAutomationService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
    ),
}

/** Ref links and QR codes share one table (`type`); the cache is dropped after commit. */
const reflinkHandler: ResourceUninstallHandler = {
  heavyChildren: ["RefLinkStat"],
  drainHeavyChildren: async (tx, ids, ctx) =>
    await deleteChildBatch(tx, {
      table: "RefLinkStat",
      parentColumn: "linkId",
      parentIds: ids,
      workspaceId: ctx.workspaceId,
    }),
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  protectedDependents: probedDependents("reflink"),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      await reflinkService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
      (deleted) =>
        sameEffects(deleted, [
          effect("qrCode.invalidateCache", { workspaceId: ctx.workspaceId }),
        ]),
    ),
}

const productHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  // An inactive product takes no new order line: the window in which a
  // committed product could gain an order holder shrinks to the in-flight ones.
  ...flagHandlers(productModel, { key: "isActive", frozen: false }),
  protectedDependents: probedDependents("product"),
  uninstallDelete: async (tx, ids, ctx) =>
    // The service core also takes the ids out of discount codes' JSON lists.
    deleteResult(
      ids,
      await productService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
    ),
}

/** The reply goes now; the media files its images copied are cleaned after commit. */
const savedReplyHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  protectedDependents: noDependents,
  uninstallDelete: async (tx, ids, ctx) => {
    // Read before the delete: the image links cascade away with the reply.
    const images = await savedReplyImageRepository.listBySavedReplyIds(
      { workspaceId: ctx.workspaceId, savedReplyIds: [...ids] },
      tx,
    )
    const fileIdsByReply = Map.groupBy(images, (image) => image.savedReplyId)
    return deleteResult(
      ids,
      await savedReplyService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
      (deleted) =>
        new Map(
          deleted.flatMap((id) => {
            const fileIds = (fileIdsByReply.get(id) ?? []).map(
              (image) => image.mediaLibraryFileId,
            )
            return fileIds.length === 0
              ? []
              : [
                  [
                    id,
                    [
                      effect("savedReply.deleteImages", {
                        workspaceId: ctx.workspaceId,
                        installationId: ctx.installationId,
                        fileIds: fileIds.join(","),
                      }),
                    ],
                  ] as const,
                ]
          }),
        ),
    )
  },
}

/**
 * Deals are installer data: a pipeline with any item is kept whole
 * (`keptHasDependents`, through the `PipelineItem` slot), so items are never
 * drained here. What is drained is the activity log of an item-less pipeline.
 */
const pipelineHandler: ResourceUninstallHandler = {
  heavyChildren: ["PipelineItemActivity"],
  drainHeavyChildren: async (tx, ids, ctx) => {
    const limit = PIPELINE_LIMITS.bulkBatchSize
    for (const pipelineId of ids) {
      const activity = await pipelineActivityRepository.deleteByPipelineBatch(
        { workspaceId: ctx.workspaceId, pipelineId, limit },
        tx,
      )
      if (activity >= limit) {
        return true
      }
    }
    return false
  },
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  protectedDependents: probedDependents("pipeline"),
  uninstallDelete: async (tx, ids, ctx) => {
    const deleted = await pipelineService.deleteInTx(tx, {
      workspaceId: ctx.workspaceId,
      ids: [...ids],
    })
    return deleteResult(
      ids,
      deleted,
      () =>
        // The service delete tells the workspace after commit; so does this.
        new Map(
          deleted.map((id) => [
            id,
            [
              effect("pipeline.afterStructureChange", {
                workspaceId: ctx.workspaceId,
                pipelineId: id,
              }),
            ],
          ]),
        ),
    )
  },
}

const aiMcpServerHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  protectedDependents: probedDependents("aiMcpServer"),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      (
        await aiMcpServerService.deleteInTx(tx, {
          workspaceId: ctx.workspaceId,
          ids: [...ids],
        })
      ).map((row) => String(row.id)),
    ),
}

/** Knowledge files: the row (embeddings cascade) goes now, the stored object after commit. */
const aiFileHandler: ResourceUninstallHandler = {
  heavyChildren: ["AIEmbedding"],
  drainHeavyChildren: async (tx, ids, ctx) =>
    await deleteChildBatch(tx, {
      table: "AIEmbedding",
      parentColumn: "aiFileId",
      parentIds: ids,
      workspaceId: ctx.workspaceId,
    }),
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  // The embeddings are gone but the run still says completed: mark it failed
  // so the UI offers "Reindex", and record the reindex to run after commit.
  giveBack: async (tx, ids, ctx) => {
    const failed = JSON.stringify({
      status: "error",
      error: "enqueueFailed",
      finishedAt: new Date().toISOString(),
    })
    if (ids.length > 0) {
      await tx
        .update(aiFileModel)
        .set({
          processingRun: sql`COALESCE("processingRun", '{}'::jsonb) || ${failed}::jsonb`,
        } as never)
        .where(
          and(
            eq(aiFileModel.workspaceId, ctx.workspaceId),
            inArray(aiFileModel.id, [...ids]),
          ),
        )
    }
    return new Map(
      ids.map((id) => [
        id,
        [
          effect("aiFile.reindex", {
            workspaceId: ctx.workspaceId,
            aiFileId: id,
          }),
        ],
      ]),
    )
  },
  protectedDependents: probedDependents("aiFile"),
  uninstallDelete: async (tx, ids, ctx) => {
    const files = await tx.query.aiFileModel.findMany({
      where: { workspaceId: ctx.workspaceId, id: { in: [...ids] } },
      columns: { id: true, path: true },
    })
    const pathById = new Map(files.map((file) => [file.id, file.path]))
    return deleteResult(
      ids,
      await aiFileService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
      (deleted) =>
        new Map(
          deleted.map((id) => [
            id,
            [effect("aiFile.deleteObject", { path: pathById.get(id) ?? null })],
          ]),
        ),
    )
  },
}

const questionnaireHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  protectedDependents: probedDependents("questionnaire"),
  uninstallDelete: async (tx, ids, ctx) => {
    // The service's own core: open submissions are cancelled, then soft-deleted.
    await questionnaireService.deleteInTx(tx, {
      workspaceId: ctx.workspaceId,
      ids: [...ids],
    })
    return { deleted: [...ids], absent: [], effects: new Map() }
  },
}

const couponTopicHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  protectedDependents: probedDependents("couponTopic"),
  uninstallDelete: async (tx, ids, ctx) =>
    // Any live topic goes (the public delete takes archived ones only).
    deleteResult(
      ids,
      (
        await couponService.deleteTopicsInTx(tx, {
          workspaceId: ctx.workspaceId,
          ids: [...ids],
          archivedOnly: false,
        })
      ).map((row) => String(row.id)),
      (deleted) =>
        sameEffects(deleted, [
          effect("coupon.invalidateCache", { workspaceId: ctx.workspaceId }),
        ]),
    ),
}

const aiAgentHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  protectedDependents: probedDependents("aiAgent"),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      await aiAgentService.deleteInTx(tx, {
        workspaceId: ctx.workspaceId,
        ids: [...ids],
      }),
      (deleted) =>
        sameEffects(deleted, [
          effect("aiAgent.invalidateCache", { workspaceId: ctx.workspaceId }),
        ]),
    ),
}

const aiFunctionHandler: ResourceUninstallHandler = {
  heavyChildren: NO_HEAVY_CHILDREN,
  freeze: noFreeze,
  unfreeze: noUnfreeze,
  protectedDependents: probedDependents("aiFunction"),
  uninstallDelete: async (tx, ids, ctx) =>
    deleteResult(
      ids,
      (
        await aiFunctionService.deleteInTx(tx, {
          workspaceId: ctx.workspaceId,
          ids: [...ids],
        })
      ).map((row) => String(row.id)),
    ),
}

/**
 * Every kind an install copies: all tracked kinds but the natural-key
 * manifests, plus `pipeline`, which is both a manifest and a copied category.
 */
type CopiedResourceKind =
  | Exclude<TemplateResourceKind, ManifestKind>
  | "pipeline"

/**
 * Per tracked kind. The settings category tracks several kinds, so the
 * dispatch is by kind, not by category; shared manifests (tags, fields,
 * folders, product categories) are never deleted and have no entry.
 * `satisfies` makes a copied kind without a handler a compile error.
 */
const HANDLERS = {
  flow: flowHandler,
  trigger: triggerHandler,
  automatedResponse: keywordHandler,
  sequence: sequenceHandler,
  calendar: calendarHandler,
  integrationWebchat: webchatHandler,
  fbCommentAutomation: commentAutomationHandler,
  reflink: reflinkHandler,
  product: productHandler,
  savedReply: savedReplyHandler,
  pipeline: pipelineHandler,
  aiMcpServer: aiMcpServerHandler,
  aiFile: aiFileHandler,
  questionnaire: questionnaireHandler,
  couponTopic: couponTopicHandler,
  aiAgent: aiAgentHandler,
  aiFunction: aiFunctionHandler,
} satisfies Record<CopiedResourceKind, ResourceUninstallHandler>

export const UNINSTALL_HANDLER_BY_KIND: Partial<
  Record<TemplateResourceKind, ResourceUninstallHandler>
> = HANDLERS
