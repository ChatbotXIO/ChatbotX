import { and, db, eq } from "@chatbotx.io/database/client"
import { couponTopicModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { rewriteBotFieldTokensDeep } from "../field-token-binder"
import { insertWithCopyName, nameStartsWith } from "./naming"
import {
  EMPTY_COLLECT_RESULT,
  updateNotSupported,
  verifyOwnedIds,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateInstallContext,
} from "./types"

type TemplateCouponTopicEntry = {
  sourceId: string
  name: string
  description: string | null
  expiresAt: string | null
  status: (typeof couponTopicModel.$inferInsert)["status"]
}

/**
 * Coupon topics ship as configuration only: codes, issuance history and
 * `hasEverHadCoupon` are never copied, so the installed topic starts empty and
 * fully editable by its owner. Names are unique per workspace
 * case-insensitively, so a taken name gets the shared numeric suffix.
 */
export const couponTopicsAdapter: ResourceAdapter<TemplateCouponTopicEntry> = {
  category: "couponTopics",
  providesKinds: ["couponTopic"],
  consumesKinds: [],
  deferredKinds: [],
  trackedKind: "couponTopic",
  folderTypes: [],
  minFormatVersion: 2,
  sync: updateNotSupported("couponTopics"),

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateCouponTopicEntry[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.couponTopic) {
      ctx.idMaps.couponTopic = new Map()
    }
    const idMap = ctx.idMaps.couponTopic
    // Topics install before the Account Fields (a field's value can name a
    // topic), so a `{{bot_field:<id>}}` in a description still holds the
    // source id here; the patch below rewrites it once the fields resolved.
    const described: { topicId: string; description: string }[] = []

    for (const entry of entries) {
      const created = await insertWithCopyName({
        tx: ctx.tx,
        constraint: "CouponTopic_workspaceId_name_idx",
        name: entry.name,
        loadTakenNames: async (tx, prefix) =>
          (
            await tx.query.couponTopicModel.findMany({
              where: {
                workspaceId: ctx.workspaceId,
                name: nameStartsWith(prefix),
              },
              columns: { name: true },
            })
          ).map((row) => row.name),
        insert: (tx, candidateName) =>
          tx
            .insert(couponTopicModel)
            .values({
              id: createId(),
              workspaceId: ctx.workspaceId,
              name: candidateName,
              description: entry.description,
              expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
              status: entry.status,
              createdById: null,
            })
            .returning()
            .then(([row]) => row),
        onGiveUp: (lastAttemptedName) =>
          ctx.warn({
            category: "couponTopics",
            entityKind: "name",
            path: `couponTopics.${entry.sourceId}.name`,
            value: lastAttemptedName,
          }),
      })
      if (!created) {
        continue
      }
      if (entry.expiresAt && new Date(entry.expiresAt) <= new Date()) {
        // Installed as shipped, but it can issue nothing until the installer
        // extends it, so say so instead of leaving an unexplained dead topic.
        ctx.warn({
          category: "couponTopics",
          entityKind: "couponTopicExpired",
          path: `couponTopics.${entry.sourceId}.expiresAt`,
          value: entry.expiresAt,
        })
      }
      idMap.set(entry.sourceId, created.id)
      if (entry.description?.includes("{{bot_field:")) {
        described.push({ topicId: created.id, description: entry.description })
      }
      ctx.track({
        category: "couponTopics",
        resourceKind: "couponTopic",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return described.length === 0
      ? []
      : [
          {
            category: "couponTopics",
            apply: async (patchCtx) => {
              for (const { topicId, description } of described) {
                const rewritten = rewriteBotFieldTokensDeep(
                  description,
                  patchCtx.idMaps.botField,
                )
                if (rewritten === description) {
                  continue
                }
                await patchCtx.tx
                  .update(couponTopicModel)
                  .set({ description: rewritten })
                  .where(
                    and(
                      eq(couponTopicModel.id, topicId),
                      eq(couponTopicModel.workspaceId, patchCtx.workspaceId),
                    ),
                  )
              }
            },
          },
        ]
  },

  collector: {
    async resolveIds(workspaceId, limit) {
      const rows = await db.query.couponTopicModel.findMany({
        where: { workspaceId, deletedAt: { isNull: true } },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.couponTopicModel.findMany({
          where: {
            workspaceId,
            id: { in: uniqueIds },
            deletedAt: { isNull: true },
          },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
      }
      const rows = await db.query.couponTopicModel.findMany({
        where: {
          workspaceId,
          id: { in: [...ids] },
          deletedAt: { isNull: true },
        },
      })
      return {
        entries: rows.map((row) => ({
          sourceId: row.id,
          name: row.name,
          description: row.description,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          status: row.status,
        })),
        folderIds: [],
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}
