import { and, db, eq } from "@chatbotx.io/database/client"
import { magicLinkModel } from "@chatbotx.io/database/schema"
import { magicLinkService } from "../../magic-link/service"
import { rewriteBotFieldTokensDeep } from "../field-token-binder"
import { createLinkRewritePatcher } from "./link-rewrite-patcher"
import { insertCopyNamed } from "./naming"
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

type TemplateMagicLinkEntry = {
  sourceId: string
  name: string
  url: string
}

/** The longest name `createMagicLinkRequest` accepts. */
const MAGIC_LINK_NAME_MAX_LENGTH = 128

/**
 * What a template does with every column of `MagicLink` (a new column fails to compile
 * until it is classified here). Click statistics live in other tables and never travel.
 */
export const MAGIC_LINK_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  // Unique per workspace: a taken name becomes `<name>-copy`.
  name: "copy",
  // Rewritten once the tools and Account Fields it names exist.
  url: "reference",
} as const satisfies Record<
  keyof typeof magicLinkModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * Magic links ship as `name` + destination `url`; click statistics never do.
 * The name is the URL path and unique per workspace, so a taken name becomes
 * `<name>-copy`, `<name>-copy-2` (URL-safe, unlike the shared ` - Copy` style)
 * and every copy's name is recorded in `magicLinkNameBindings` so a flow button
 * that points at the old path follows the copy.
 */
export const magicLinksAdapter: ResourceAdapter<TemplateMagicLinkEntry> = {
  category: "magicLinks",
  providesKinds: ["magicLink"],
  consumesKinds: [],
  deferredKinds: [],
  trackedKind: "magicLink",
  folderTypes: [],
  minFormatVersion: 3,
  // The url may point at a tool installed after the links (a dynamic image).
  rewritesLinksInPatch: true,
  sync: updateNotSupported("magicLinks"),

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateMagicLinkEntry[],
  ): Promise<PatchTask[]> {
    const patcher = createLinkRewritePatcher<string>("magicLinks")
    for (const entry of entries) {
      const created = await insertCopyNamed(ctx, {
        category: "magicLinks",
        constraint: "MagicLink_workspaceId_name_key",
        entry,
        nameRules: { style: "slug", maxLength: MAGIC_LINK_NAME_MAX_LENGTH },
        findTaken: (tx, name) =>
          tx.query.magicLinkModel.findMany({
            where: { workspaceId: ctx.workspaceId, name },
            columns: { name: true },
          }),
        insert: (tx, name) =>
          magicLinkService.insertInTx(tx, {
            workspaceId: ctx.workspaceId,
            data: { name, url: entry.url },
          }),
      })
      if (!created) {
        continue
      }
      ctx.magicLinkNameBindings = new Map([
        ...(ctx.magicLinkNameBindings ?? []),
        [entry.name, created.name],
      ])
      recordCopy(ctx, {
        category: "magicLinks",
        resourceKind: "magicLink",
        idMapKind: "magicLink",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
      patcher.defer({
        sourceId: entry.sourceId,
        original: entry.url,
        // Once every tool and Account Field is in: the url follows the copies it names.
        finish: (linked, patchCtx) =>
          rewriteBotFieldTokensDeep(linked, patchCtx.idMaps.botField),
        write: async (tx, url, patchCtx) => {
          await tx
            .update(magicLinkModel)
            .set({ url })
            .where(
              and(
                eq(magicLinkModel.id, created.id),
                eq(magicLinkModel.workspaceId, patchCtx.workspaceId),
              ),
            )
        },
      })
    }
    return patcher.tasks()
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.magicLinkModel.findMany({
        where: scopedWhere(query),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.magicLinkModel.findMany({
        where: scopedWhere({ workspaceId, ids }),
      })
      return {
        entries: rows.map((row) => ({
          sourceId: row.id,
          name: row.name,
          url: row.url,
        })),
      }
    },
  }),
}
