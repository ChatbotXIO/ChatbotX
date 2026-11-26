import { db } from "@chatbotx.io/database/client"
import type { DiscountCodeModel } from "@chatbotx.io/database/types"
import { discountCodeService } from "../../discount-code/service"
import { ChatbotXException } from "../../errors"
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

type TemplateDiscountCodeEntry = Pick<
  DiscountCodeModel,
  | "code"
  | "autoApply"
  | "discountType"
  | "discountValue"
  | "appliesTo"
  | "minimumType"
  | "minimumValue"
  | "usageLimit"
  | "oncePerCustomer"
> & {
  sourceId: string
  /** A `manifests.productCategories` sourceId, with `appliesTo: category`. */
  categoryId: string | null
  /** `resources.products` sourceIds, with `appliesTo: products`. */
  productIds: string[]
  startsAt: string
  endsAt: string | null
}

/**
 * A code that applies to products or a category needs them: one whose products
 * or category did not all come along is skipped with a warning, never turned
 * into "every product". Resolved before writing, since a throw aborts the whole
 * install.
 */
const resolveTargets = (
  ctx: TemplateInstallContext,
  entry: TemplateDiscountCodeEntry,
): { categoryId: string | null; productIds: string[] } | null => {
  if (entry.appliesTo === "category") {
    const categoryId = entry.categoryId
      ? (ctx.idMaps.productCategory?.get(entry.categoryId) ?? null)
      : null
    return categoryId ? { categoryId, productIds: [] } : null
  }
  if (entry.appliesTo === "products") {
    const productIds = entry.productIds.flatMap(
      (id) => ctx.idMaps.product?.get(id) ?? [],
    )
    return productIds.length > 0 &&
      productIds.length === entry.productIds.length
      ? { categoryId: null, productIds }
      : null
  }
  return { categoryId: null, productIds: [] }
}

/**
 * What a template does with every column of `DiscountCode`. Only ChatbotX-sourced codes travel.
 */
export const DISCOUNT_CODE_COLUMNS = {
  id: "reset",
  createdAt: "reset",
  updatedAt: "reset",
  workspaceId: "reset",
  // Also how an existing code is found.
  code: "copy",
  autoApply: "copy",
  discountType: "copy",
  discountValue: "copy",
  appliesTo: "copy",
  categoryId: "reference",
  productIds: "reference",
  minimumType: "copy",
  minimumValue: "copy",
  usageLimit: "copy",
  usedCount: "reset",
  oncePerCustomer: "copy",
  // Always everyone: a customer filter names the creator's customers.
  eligibility: "reset",
  customerFilter: "drop",
  startsAt: "copy",
  endsAt: "copy",
  // Never live until the installer switches it on.
  isActive: "reset",
  source: "reset",
  // Belongs to an external store.
  externalId: "drop",
} as const satisfies Record<
  keyof DiscountCodeModel,
  "copy" | "reset" | "drop" | "rebind" | "reference"
>

/**
 * Discount codes are found by code (case-insensitively, among the store's own):
 * one the installer already has is kept as it is. A code never switches itself
 * on (an active automatic code would take money off carts at once), never
 * carries a use count, and a code limited to specific customers is not copied
 * (its filter names the creator's customers). Part of the Ecommerce group.
 */
export const discountCodesAdapter: ResourceAdapter<TemplateDiscountCodeEntry> =
  {
    category: "discountCodes",
    providesKinds: ["discountCode"],
    consumesKinds: ["product", "productCategory"],
    deferredKinds: [],
    trackedKind: "discountCode",
    folderTypes: [],
    minFormatVersion: 3,
    sync: updateNotSupported("discountCodes"),

    async insert(
      ctx: TemplateInstallContext,
      entries: readonly TemplateDiscountCodeEntry[],
    ): Promise<PatchTask[]> {
      for (const entry of entries) {
        const targets = resolveTargets(ctx, entry)
        if (!targets) {
          ctx.warn({
            category: "discountCodes",
            entityKind: "discountCodeSkipped",
            path: `discountCodes.${entry.sourceId}`,
            value: entry.code,
          })
          continue
        }
        const startsAt = new Date(entry.startsAt)
        const endsAt = entry.endsAt ? new Date(entry.endsAt) : null
        let values: Awaited<ReturnType<typeof discountCodeService.prepareInTx>>
        try {
          values = await discountCodeService.prepareInTx(
            ctx.tx,
            ctx.workspaceId,
            {
              ...entry,
              ...targets,
              startsAt,
              endsAt,
              eligibility: "everyone",
              customerFilter: null,
              // Never live until the installer switches it on.
              isActive: false,
            },
          )
        } catch (error) {
          if (!(error instanceof ChatbotXException)) {
            throw error
          }
          ctx.warn({
            category: "discountCodes",
            entityKind: "discountCodeSkipped",
            path: `discountCodes.${entry.sourceId}`,
            value: error.message,
          })
          continue
        }
        const { row, created } = await discountCodeService.insertOrFindInTx(
          ctx.tx,
          {
            ...values,
            workspaceId: ctx.workspaceId,
            source: "chatbotx",
          },
        )
        if (created && endsAt && endsAt <= new Date()) {
          ctx.warn({
            category: "discountCodes",
            entityKind: "scheduleExpired",
            path: `discountCodes.${entry.sourceId}.endsAt`,
            value: entry.endsAt ?? "",
          })
        }
        recordCopy(ctx, {
          category: "discountCodes",
          resourceKind: "discountCode",
          idMapKind: "discountCode",
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
          db.query.discountCodeModel.findMany({
            where: scopedWhere(query, {
              source: "chatbotx" as const,
              eligibility: { ne: "specificCustomers" as const },
            }),
            columns: { id: true },
            limit: query.limit,
          }),

        async collectRows(workspaceId, ids) {
          const rows = await db.query.discountCodeModel.findMany({
            where: scopedWhere(
              { workspaceId, ids },
              {
                source: "chatbotx" as const,
                eligibility: { ne: "specificCustomers" as const },
              },
            ),
          })
          return {
            entries: rows.map(
              (row): TemplateDiscountCodeEntry => ({
                sourceId: row.id,
                code: row.code,
                autoApply: row.autoApply,
                discountType: row.discountType,
                discountValue: row.discountValue,
                appliesTo: row.appliesTo,
                categoryId: row.categoryId,
                productIds: row.productIds,
                minimumType: row.minimumType,
                minimumValue: row.minimumValue,
                usageLimit: row.usageLimit,
                oncePerCustomer: row.oncePerCustomer,
                startsAt: row.startsAt.toISOString(),
                endsAt: row.endsAt?.toISOString() ?? null,
              }),
            ),
            productCategoryIds: rows.flatMap((row) =>
              row.categoryId ? [row.categoryId] : [],
            ),
            // A code limited to products is useless without them.
            hardDependencies: rows.flatMap((row) =>
              row.productIds.map((sourceId) => ({
                category: "products" as const,
                sourceId,
              })),
            ),
          }
        },
      }),
    ),
  }
