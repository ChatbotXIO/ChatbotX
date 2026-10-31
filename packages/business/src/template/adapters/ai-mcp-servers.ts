import { db, sql } from "@chatbotx.io/database/client"
import { aiMCPServerModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { freeCopyNames } from "../../lib/copy-name"
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

type TemplateMcpServerEntry = {
  sourceId: string
  name: string
  url: string
  /** The URL carried more than its origin (userinfo, path, query or fragment); it was dropped. */
  urlHadSecret: boolean
  /** Which kind of credential the source used — never the credential. */
  authType: "none" | "token" | "header"
  /** Header names of a `header` credential, so the installer knows what to supply. */
  headerNames: string[]
  availableTools: Record<string, unknown>
  selectedTools: string[]
}

/**
 * Credentials never leave the source workspace, and a server URL can carry one
 * anywhere: userinfo, query, fragment and — for hosted providers that treat
 * the address as the secret — the path itself. Only the origin is shipped; the
 * installer completes the address with their own, which is why the URL is not
 * a locked field. `hadSecret` is true whenever anything beyond the bare origin
 * was dropped, so the install can ask for it.
 */
export const stripUrlSecrets = (
  url: string,
): { url: string; hadSecret: boolean } => {
  try {
    const parsed = new URL(url)
    const hadSecret = Boolean(
      parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        (parsed.pathname !== "/" && parsed.pathname !== ""),
    )
    return { url: `${parsed.origin}/`, hadSecret }
  } catch {
    // Not a parseable URL: nothing safe to ship.
    return { url: "", hadSecret: true }
  }
}

/** The source's own name when free, else the first free `<name> - Copy`. */
const pickFreeName = (name: string, taken: ReadonlySet<string>): string =>
  taken.has(name)
    ? (freeCopyNames(name, taken, { style: "dash", maxLength: 255 })[0] ?? name)
    : name

/**
 * MCP servers are copied without credentials: installed with `auth: none` and
 * reported as `credentialRequired` so the installer adds their own. Names are
 * unique per workspace only by convention (the service checks, the table does
 * not), so a taken name gets a ` - Copy` suffix instead of failing.
 */
export const aiMcpServersAdapter: ResourceAdapter<TemplateMcpServerEntry> = {
  category: "aiMcpServers",
  providesKinds: ["aiMcpServer"],
  consumesKinds: [],
  deferredKinds: [],
  trackedKind: "aiMcpServer",
  folderTypes: [],
  minFormatVersion: 2,
  sync: updateNotSupported("aiMcpServers"),

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateMcpServerEntry[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.aiMcpServer) {
      ctx.idMaps.aiMcpServer = new Map()
    }
    const idMap = ctx.idMaps.aiMcpServer
    if (entries.length === 0) {
      return []
    }

    // Names are unique only by convention (no index), so two installs into one
    // workspace must not both see a name as free: serialise the check.
    await ctx.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`mcp-name:${ctx.workspaceId}`}, 0))`,
    )
    const taken = new Set(
      (
        await ctx.tx.query.aiMCPServerModel.findMany({
          where: { workspaceId: ctx.workspaceId },
          columns: { name: true },
        })
      ).map((row) => row.name),
    )

    for (const entry of entries) {
      const name = pickFreeName(entry.name, taken)
      taken.add(name)

      const id = createId()
      await ctx.tx.insert(aiMCPServerModel).values({
        id,
        workspaceId: ctx.workspaceId,
        name,
        url: entry.url,
        auth: { type: "none" },
        availableTools: entry.availableTools,
        selectedTools: entry.selectedTools,
      })

      if (entry.authType !== "none" || entry.urlHadSecret || !entry.url) {
        ctx.warn({
          category: "aiMcpServers",
          entityKind: "credentialRequired",
          path: `aiMcpServers.${entry.sourceId}.auth`,
          value: entry.headerNames.join(", "),
        })
      }

      idMap.set(entry.sourceId, id)
      ctx.track({
        category: "aiMcpServers",
        resourceKind: "aiMcpServer",
        resourceId: id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [] satisfies PatchTask[]
  },

  collector: {
    async resolveIds(workspaceId, limit) {
      const rows = await db.query.aiMCPServerModel.findMany({
        where: { workspaceId },
        columns: { id: true },
        limit,
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      return await verifyOwnedIds(ids, (uniqueIds) =>
        db.query.aiMCPServerModel.findMany({
          where: { workspaceId, id: { in: uniqueIds } },
          columns: { id: true },
        }),
      )
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return EMPTY_COLLECT_RESULT
      }
      const rows = await db.query.aiMCPServerModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
      })
      const entries = rows.map((row) => {
        const { url, hadSecret } = stripUrlSecrets(row.url)
        return {
          sourceId: row.id,
          name: row.name,
          url,
          urlHadSecret: hadSecret,
          authType: row.auth.type,
          headerNames:
            row.auth.type === "header"
              ? row.auth.headers.map((entry) => entry.header)
              : [],
          availableTools: row.availableTools,
          selectedTools: row.selectedTools,
        }
      })
      return {
        entries,
        folderIds: [],
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}
