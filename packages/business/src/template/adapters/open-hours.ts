import { db } from "@chatbotx.io/database/client"
import type { OpenHoursRange } from "@chatbotx.io/database/partials"
import type { ecommerceOpenHoursModel } from "@chatbotx.io/database/schema"
import { ecommerceOpenHoursService } from "../../ecommerce-open-hours/service"
import { withoutExternalStore } from "./external-store-collector"
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

type TemplateOpenHoursEntry = {
  sourceId: string
  name: string
  ranges: OpenHoursRange[]
}

/**
 * What a template does with every column of `EcommerceOpenHours`.
 */
export const OPEN_HOURS_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  name: "copy",
  ranges: "copy",
} as const satisfies Record<
  keyof typeof ecommerceOpenHoursModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * Open-hours schedules ship with their name and ranges, always as new rows (a
 * schedule has no natural key). Part of the Ecommerce group: nothing travels
 * when either workspace sells from an external store.
 */
export const openHoursAdapter: ResourceAdapter<TemplateOpenHoursEntry> = {
  category: "openHours",
  providesKinds: ["openHours"],
  consumesKinds: [],
  deferredKinds: [],
  trackedKind: "openHours",
  folderTypes: [],
  minFormatVersion: 3,
  sync: updateNotSupported("openHours"),

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateOpenHoursEntry[],
  ): Promise<PatchTask[]> {
    for (const entry of entries) {
      const created = await ecommerceOpenHoursService.insertInTx(ctx.tx, {
        workspaceId: ctx.workspaceId,
        name: entry.name,
        ranges: entry.ranges,
      })
      recordCopy(ctx, {
        category: "openHours",
        resourceKind: "openHours",
        idMapKind: "openHours",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
    }
    return [] satisfies PatchTask[]
  },

  collector: withoutExternalStore(
    makeCollector({
      findIds: (query) =>
        db.query.ecommerceOpenHoursModel.findMany({
          where: scopedWhere(query),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.ecommerceOpenHoursModel.findMany({
          where: scopedWhere({ workspaceId, ids }),
        })
        return {
          entries: rows.map(
            (row): TemplateOpenHoursEntry => ({
              sourceId: row.id,
              name: row.name,
              ranges: row.ranges,
            }),
          ),
        }
      },
    }),
  ),
}
