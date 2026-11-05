import { db, eq } from "@chatbotx.io/database/client"
import type { WebchatPersistentMenu } from "@chatbotx.io/database/partials"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { ChatbotXException } from "../../errors"
import {
  type CreateWebchatRequest,
  integrationWebchatService,
} from "../../integration-webchat/service"
import {
  createFlowRefPatcher,
  dependenciesOn,
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
 * Webchats provision a brand-new Inbox + Connection row per row, gated by
 * `integrationWebchatService.create`'s upfront
 * `quotaEnforcementService.isAtLimit` channel-quota check, which throws
 * `channelLimitReachedException` before inserting anything once the owner's
 * channel quota is exhausted. Unlike every other adapter, a single
 * quota-exhausted webchat must NOT abort the whole install — this is the one
 * place a per-resource DB error is caught and downgraded to a warning rather
 * than left to propagate and roll back the install transaction. Any other
 * error still propagates.
 *
 * `welcomeFlowId` is always deferred (webchats insert before flows in Phase
 * 1) and patched once `idMaps.flow` is complete.
 */
export const webchatsAdapter: ResourceAdapter<TemplateWebchatEntry> = {
  category: "webchats",
  providesKinds: [],
  consumesKinds: ["flow"],
  deferredKinds: ["flow"],
  trackedKind: "integrationWebchat",
  folderTypes: [],
  minFormatVersion: 1,
  sync: updateNotSupported("webchats"),

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateWebchatEntry[],
  ): Promise<PatchTask[]> {
    if (entries.length === 0) {
      return []
    }

    const workspace = await ctx.tx.query.workspaceModel.findFirst({
      where: { id: ctx.workspaceId },
      columns: { ownerId: true },
    })
    if (!workspace) {
      // Every entry is skipped: say so instead of dropping them silently.
      for (const entry of entries) {
        ctx.warn({
          category: "webchats",
          entityKind: "workspaceUnavailable",
          path: `webchats.${entry.sourceId}`,
          value: ctx.workspaceId,
        })
      }
      return []
    }

    const flowRefs = createFlowRefPatcher("webchats")

    for (const entry of entries) {
      const data: CreateWebchatRequest = {
        name: entry.name,
        auth: entry.auth ?? {},
        enable: entry.enable,
        authorizedDomains: entry.authorizedDomains,
        conversationStarters: entry.conversationStarters,
        persistentMenus: entry.persistentMenus as WebchatPersistentMenu[],
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

      flowRefs.defer({
        sourceEntryId: entry.sourceId,
        field: "welcomeFlowId",
        sourceFlowId: entry.welcomeFlowId,
        write: async (tx, welcomeFlowId) => {
          await tx
            .update(integrationWebchatModel)
            .set({ welcomeFlowId })
            .where(eq(integrationWebchatModel.id, created.integration.id))
        },
      })
      recordCopy(ctx, {
        category: "webchats",
        resourceKind: "integrationWebchat",
        sourceId: entry.sourceId,
        resourceId: created.integration.id,
      })
    }

    return flowRefs.tasks()
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.integrationWebchatModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.integrationWebchatModel.findMany({
        where: scopedWhere({ workspaceId, ids }),
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

      // The welcome flow travels with the webchat, like a keyword's flow.
      return {
        entries,
        hardDependencies: dependenciesOn(
          "flows",
          rows.map((row) => row.welcomeFlowId),
        ),
      }
    },
  }),
}
