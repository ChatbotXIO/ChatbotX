import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { rewriteEntryResourceLinks } from "../resource-links"
import type { PatchTask, TemplateInstallContext } from "./types"

/**
 * Re-rewrites the public links of copied content once EVERY tool of the
 * install exists (Phase 2): an insert-time rewrite cannot see a copy that
 * installs later, or the row's own id. An adapter using it sets
 * `rewritesLinksInPatch`, inserts the content as shipped and defers each stored
 * value here. The rewrite always starts from the ORIGINAL value (idempotent)
 * and nothing is written when it did not change (`finish` runs on the
 * rewritten value, e.g. to add the Account Field tokens).
 */
export const createLinkRewritePatcher = <V>(category: TemplateCategory) => {
  const targets: Array<{
    sourceId: string
    original: V
    finish?: (value: V, ctx: TemplateInstallContext) => V
    write: (
      tx: DatabaseClient,
      value: V,
      ctx: TemplateInstallContext,
    ) => Promise<void>
  }> = []
  return {
    defer(target: (typeof targets)[number]): void {
      targets.push(target)
    },
    /** The Phase-2 task, or none when nothing was deferred. */
    tasks(): PatchTask[] {
      if (targets.length === 0) {
        return []
      }
      return [
        {
          category,
          apply: async (ctx) => {
            for (const { sourceId, original, finish, write } of targets) {
              const [{ value: linked }] = rewriteEntryResourceLinks(
                ctx,
                category,
                [{ sourceId, value: original }],
              )
              const value = finish ? finish(linked, ctx) : linked
              if (JSON.stringify(value) !== JSON.stringify(original)) {
                await write(ctx.tx, value, ctx)
              }
            }
          },
        },
      ]
    },
  }
}
