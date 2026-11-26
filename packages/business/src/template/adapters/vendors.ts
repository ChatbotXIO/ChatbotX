import { db } from "@chatbotx.io/database/client"
import type { VendorModel } from "@chatbotx.io/database/types"
import { vendorService } from "../../vendor/service"
import { withoutExternalStore } from "./external-store-collector"
import {
  dependenciesOn,
  makeCollector,
  recordCopy,
  resolveRef,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import {
  resolveToolImageUrl,
  stageToolImages,
  type ToolImageSlot,
} from "./staging"
import type {
  PatchTask,
  ResourceAdapter,
  StagedObject,
  TemplateInstallContext,
  TemplateStageContext,
} from "./types"

type TemplateVendorEntry = Pick<
  VendorModel,
  | "name"
  | "shortDescription"
  | "phone"
  | "storeAddress"
  | "imageUrl"
  | "isActive"
  | "discountPercent"
  | "minimumOrderValue"
  | "rank"
> & {
  sourceId: string
  /** A `resources.openHours` sourceId. */
  openHoursId: string | null
  /** `manifests.productCategories` sourceIds; kept together or dropped together. */
  categoryId: string | null
  subcategoryId: string | null
}

const VENDOR_IMAGE_SKIPPED = "vendorImage"
const logoSlot = (entry: TemplateVendorEntry): ToolImageSlot[] =>
  entry.imageUrl
    ? [{ stageKey: `vendors:${entry.sourceId}:logo`, url: entry.imageUrl }]
    : []

/**
 * What a template does with every column of `Vendor`. Only ChatbotX-sourced vendors travel.
 */
export const VENDOR_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  // Also how an existing vendor is found.
  name: "copy",
  shortDescription: "copy",
  phone: "copy",
  storeAddress: "copy",
  // Staged into the installer's storage.
  imageUrl: "copy",
  isActive: "copy",
  discountPercent: "copy",
  minimumOrderValue: "copy",
  rank: "copy",
  openHoursId: "reference",
  // Kept together with the sub-category or dropped with it.
  categoryId: "reference",
  subcategoryId: "reference",
  // Always a ChatbotX-managed vendor.
  source: "reset",
} as const satisfies Record<
  keyof VendorModel,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * Vendors are found by name (case-insensitively, among the store's own): one
 * the installer already has is reused as it is, and the copied fields are
 * written only into a vendor this install creates. The schedule and the
 * categories are rebound; a category without its parent or sub-category is
 * dropped as a pair. Part of the Ecommerce group (nothing travels with an
 * external store).
 */
export const vendorsAdapter: ResourceAdapter<TemplateVendorEntry> = {
  category: "vendors",
  providesKinds: ["vendor"],
  consumesKinds: ["openHours", "productCategory"],
  deferredKinds: [],
  trackedKind: "vendor",
  folderTypes: [],
  minFormatVersion: 3,
  sync: updateNotSupported("vendors"),

  async stage(
    ctx: TemplateStageContext,
    entries: readonly TemplateVendorEntry[],
  ): Promise<Map<string, StagedObject>> {
    return await stageToolImages(
      ctx,
      entries.flatMap(logoSlot),
      VENDOR_IMAGE_SKIPPED,
    )
  },

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateVendorEntry[],
  ): Promise<PatchTask[]> {
    for (const entry of entries) {
      const openHoursId = resolveRef(ctx, {
        category: "vendors",
        kind: "openHours",
        path: `vendors.${entry.sourceId}.openHoursId`,
        sourceRef: entry.openHoursId,
      })
      const resolvedCategoryId = resolveRef(ctx, {
        category: "vendors",
        kind: "productCategory",
        path: `vendors.${entry.sourceId}.categoryId`,
        sourceRef: entry.categoryId,
      })
      const resolvedSubcategoryId = resolvedCategoryId
        ? resolveRef(ctx, {
            category: "vendors",
            kind: "productCategory",
            path: `vendors.${entry.sourceId}.subcategoryId`,
            sourceRef: entry.subcategoryId,
          })
        : null
      // A category and its sub-category are kept together or dropped together.
      const pairBroken = Boolean(entry.subcategoryId) && !resolvedSubcategoryId
      const categoryId = pairBroken ? null : resolvedCategoryId
      const subcategoryId = pairBroken ? null : resolvedSubcategoryId
      const [logo] = logoSlot(entry)
      const { row, created } = await vendorService.insertOrFindInTx(ctx.tx, {
        workspaceId: ctx.workspaceId,
        name: entry.name.trim(),
        shortDescription: entry.shortDescription,
        phone: entry.phone,
        storeAddress: entry.storeAddress,
        imageUrl: logo
          ? resolveToolImageUrl(ctx, {
              ...logo,
              category: "vendors",
              skippedKind: VENDOR_IMAGE_SKIPPED,
              path: `vendors.${entry.sourceId}.imageUrl`,
            })
          : null,
        isActive: entry.isActive,
        discountPercent: entry.discountPercent,
        minimumOrderValue: entry.minimumOrderValue,
        openHoursId,
        categoryId,
        subcategoryId,
        rank: entry.rank,
        source: "chatbotx",
      })
      recordCopy(ctx, {
        category: "vendors",
        resourceKind: "vendor",
        idMapKind: "vendor",
        sourceId: entry.sourceId,
        resourceId: row.id,
        wasExisting: !created,
      })
    }
    return [] satisfies PatchTask[]
  },

  collector: withoutExternalStore(
    makeCollector({
      findIds: (query) =>
        db.query.vendorModel.findMany({
          where: scopedWhere(query, { source: "chatbotx" as const }),
          columns: { id: true },
          limit: query.limit,
        }),

      async collectRows(workspaceId, ids) {
        const rows = await db.query.vendorModel.findMany({
          where: scopedWhere(
            { workspaceId, ids },
            { source: "chatbotx" as const },
          ),
        })
        return {
          entries: rows.map(
            (row): TemplateVendorEntry => ({
              sourceId: row.id,
              name: row.name,
              shortDescription: row.shortDescription,
              phone: row.phone,
              storeAddress: row.storeAddress,
              imageUrl: row.imageUrl,
              isActive: row.isActive,
              discountPercent: row.discountPercent,
              minimumOrderValue: row.minimumOrderValue,
              rank: row.rank,
              openHoursId: row.openHoursId,
              categoryId: row.categoryId,
              subcategoryId: row.subcategoryId,
            }),
          ),
          productCategoryIds: rows.flatMap((row) =>
            [row.categoryId, row.subcategoryId].filter(
              (id): id is string => id !== null,
            ),
          ),
          hardDependencies: dependenciesOn(
            "openHours",
            rows.map((row) => row.openHoursId),
          ),
        }
      },
    }),
  ),
}
