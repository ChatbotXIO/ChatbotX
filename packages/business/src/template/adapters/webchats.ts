import { db, eq } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { ChatbotXException } from "../../errors"
import {
  type CreateWebchatRequest,
  integrationWebchatService,
} from "../../integration-webchat/service"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateInstallContext,
} from "./types"

type TemplateWebchatEntry = {
  sourceId: string
  name: string
  auth?: Record<string, unknown>
  enable: boolean
  authorizedDomains: string[]
  conversationStarters: unknown[]
  persistentMenus: unknown[]
  brandColor: string
  hideHeader: boolean
  showLogo: boolean
  hideMessageInput: boolean
  customCss: string | null
  // Points at a `resources.flows` sourceId — flows insert *after* webchats
  // in Phase 1, so this is always deferred to Phase 2.
  welcomeFlowId?: string | null
}

const isChannelLimitReached = (error: unknown): boolean =>
  error instanceof ChatbotXException && error.code === "channelLimitReached"

/**
 * Webchats provision a brand-new Inbox per row, which consumes channel
 * quota (`inboxService.create` -> `quotaEnforcementService.tryConsume`).
 * Unlike every other adapter, a single quota-exhausted webchat must NOT
 * abort the whole install — this is the one place a per-resource DB error
 * is caught and downgraded to a warning rather than left to propagate and
 * roll back the install transaction. Any other error still propagates.
 *
 * `welcomeFlowId` is always deferred (webchats insert before flows in Phase
 * 1) and patched once `idMaps.flow` is complete.
 */
export const webchatsAdapter: ResourceAdapter = {
  category: "webchats",
  providesKinds: [],
  consumesKinds: ["flow"],
  deferredKinds: ["flow"],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    if (entries.length === 0) {
      return []
    }

    const workspace = await ctx.tx.query.workspaceModel.findFirst({
      where: { id: ctx.workspaceId },
      columns: { ownerId: true },
    })
    if (!workspace) {
      return []
    }

    const pendingWelcomeFlowBySourceId = new Map<string, string>()

    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateWebchatEntry
      const data: CreateWebchatRequest = {
        name: entry.name,
        auth: entry.auth ?? {},
        enable: entry.enable,
        authorizedDomains: entry.authorizedDomains,
        conversationStarters: entry.conversationStarters,
        persistentMenus: entry.persistentMenus,
        brandColor: entry.brandColor,
        hideHeader: entry.hideHeader,
        showLogo: entry.showLogo,
        hideMessageInput: entry.hideMessageInput,
        customCss: entry.customCss,
        welcomeFlowId: null,
      }

      let created: Awaited<ReturnType<typeof integrationWebchatService.create>>
      try {
        created = await integrationWebchatService.create(
          { workspaceId: ctx.workspaceId, ownerId: workspace.ownerId, data },
          ctx.tx,
        )
      } catch (error) {
        if (!isChannelLimitReached(error)) {
          throw error
        }
        ctx.warn({
          category: "webchats",
          entityKind: "quota",
          path: `webchats.${entry.sourceId}`,
          value: "channelLimitReached",
        })
        continue
      }

      if (entry.welcomeFlowId) {
        pendingWelcomeFlowBySourceId.set(created.id, entry.welcomeFlowId)
      }
      ctx.track({
        category: "webchats",
        resourceKind: "integrationWebchat",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [
      {
        category: "webchats",
        apply: async (patchCtx) => {
          for (const [
            webchatId,
            flowSourceId,
          ] of pendingWelcomeFlowBySourceId) {
            const targetFlowId = patchCtx.idMaps.flow?.get(flowSourceId)
            if (!targetFlowId) {
              patchCtx.warn({
                category: "webchats",
                entityKind: "flow",
                path: `webchats.${webchatId}.welcomeFlowId`,
                value: flowSourceId,
              })
              continue
            }
            await patchCtx.tx
              .update(integrationWebchatModel)
              .set({ welcomeFlowId: targetFlowId })
              .where(eq(integrationWebchatModel.id, webchatId))
          }
        },
      },
    ]
  },

  collector: {
    async resolveIds(workspaceId) {
      const rows = await db.query.integrationWebchatModel.findMany({
        where: { workspaceId },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) {
        return []
      }
      const rows = await db.query.integrationWebchatModel.findMany({
        where: { workspaceId, id: { in: uniqueIds } },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return {
          entries: [],
          folderIds: [],
          productCategoryIds: [],
          hardDependencies: [],
        }
      }
      const rows = await db.query.integrationWebchatModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
      })
      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        // `auth` holds the webchat's own client-side embed credentials
        // (never a third-party OAuth token), so it is carried over as-is —
        // the same treatment `integrationWebchatService.create` gives it on
        // every normal create.
        auth: row.auth,
        enable: row.enable,
        authorizedDomains: row.authorizedDomains,
        conversationStarters: row.conversationStarters,
        persistentMenus: row.persistentMenus,
        brandColor: row.brandColor,
        hideHeader: row.hideHeader,
        showLogo: row.showLogo,
        hideMessageInput: row.hideMessageInput,
        customCss: row.customCss,
        welcomeFlowId: row.welcomeFlowId,
      }))

      return {
        entries,
        folderIds: [],
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}
