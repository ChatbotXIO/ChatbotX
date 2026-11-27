import { db } from "@chatbotx.io/database/client"
import type { placeLocationModel } from "@chatbotx.io/database/schema"
import { placeLocationService } from "../../place-near-me/location.service"
import {
  makeCollector,
  recordCopy,
  resolveRef,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplatePlaceLocationEntry = {
  sourceId: string
  name: string
  latitude: number
  longitude: number
  /** A `manifests.placeCategories` sourceId; the installer's category is found or created by name. */
  categoryId: string | null
}

/**
 * What a template does with every column of `PlaceLocation`.
 */
export const PLACE_LOCATION_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  name: "copy",
  latitude: "copy",
  longitude: "copy",
  // Found or created by name in the installer's workspace.
  categoryId: "reference",
} as const satisfies Record<
  keyof typeof placeLocationModel.$inferSelect,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * Places Near Me locations ship with their name and coordinates (the creator
 * chose to tick them) and their category by name. A category that did not
 * resolve leaves the location uncategorised, with a warning.
 */
export const placeLocationsAdapter: ResourceAdapter<TemplatePlaceLocationEntry> =
  {
    category: "placeLocations",
    providesKinds: ["placeLocation"],
    consumesKinds: ["placeCategory"],
    deferredKinds: [],
    trackedKind: "placeLocation",
    folderTypes: [],
    minFormatVersion: 3,
    sync: updateNotSupported("placeLocations"),

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplatePlaceLocationEntry[],
    ): Promise<PatchTask[]> {
      for (const entry of entries) {
        // `insertInTx` throws on a blank name, which would fail the whole
        // install; a skip is decided here, before anything is written.
        if (entry.name.trim().length === 0) {
          ctx.warn({
            category: "placeLocations",
            entityKind: "placeLocationInvalid",
            path: `placeLocations.${entry.sourceId}.name`,
            value: "",
          })
          continue
        }
        const categoryId = resolveRef(ctx, {
          category: "placeLocations",
          kind: "placeCategory",
          path: `placeLocations.${entry.sourceId}.categoryId`,
          sourceRef: entry.categoryId,
        })
        const created = await placeLocationService.insertInTx(ctx.tx, {
          workspaceId: ctx.workspaceId,
          name: entry.name,
          latitude: entry.latitude,
          longitude: entry.longitude,
          categoryId,
        })
        recordCopy(ctx, {
          category: "placeLocations",
          resourceKind: "placeLocation",
          sourceId: entry.sourceId,
          resourceId: created.id,
        })
      }
      return [] satisfies PatchTask[]
    },

    collector: makeCollector({
      findIds: (query) =>
        db.query.placeLocationModel.findMany({
          where: scopedWhere(query),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.placeLocationModel.findMany({
          where: scopedWhere({ workspaceId, ids }),
        })
        return {
          entries: rows.map((row) => ({
            sourceId: row.id,
            name: row.name,
            latitude: row.latitude,
            longitude: row.longitude,
            categoryId: row.categoryId,
          })),
          placeCategoryIds: rows.flatMap((row) =>
            row.categoryId ? [row.categoryId] : [],
          ),
        }
      },
    }),
  }
