import type { z } from "zod"
import { flowValidationCodes } from "../validation-codes"
import type {
  WaTemplateButtonParam,
  WaTemplateParams,
} from "./send-wa-message-template"

/**
 * Meta: MPM (multi-product message) buttons support "up to 10 sections" and
 * "up to 30 products across all sections." Named so the section builder (UI)
 * and this publish-time refinement can never drift on the numbers.
 */
export const waTemplateMpmLimits = {
  maxSections: 10,
  maxProductsTotal: 30,
} as const

const isConfiguredRetailerId = (value: string | undefined): value is string =>
  Boolean(value?.trim())

/**
 * Total CONFIGURED product count across every section of one MPM button's
 * payload. Rows the section builder added but the user never filled carry
 * `product_retailer_id: ""` — those are placeholders, not products, so they
 * never count toward the minimum or the Meta caps.
 */
export function countMpmProducts(
  sections: WaTemplateButtonParam["sections"],
): number {
  return (sections ?? []).reduce(
    (total, section) =>
      total +
      (section.product_items ?? []).filter((item) =>
        isConfiguredRetailerId(item.product_retailer_id),
      ).length,
    0,
  )
}

/** A section is sendable only when every one of its rows has a real id. */
const sectionHasBlankOrNoProducts = (
  section: NonNullable<WaTemplateButtonParam["sections"]>[number],
): boolean => {
  const items = section.product_items ?? []
  return (
    items.length === 0 ||
    items.some((item) => !isConfiguredRetailerId(item.product_retailer_id))
  )
}

const findMpmButtonParams = (
  buttons: ReadonlyArray<WaTemplateButtonParam | null | undefined> | undefined,
): WaTemplateButtonParam[] =>
  (buttons ?? []).flatMap((button) =>
    button?.sub_type === "mpm" ? [button] : [],
  )

type MpmValidationTarget = {
  path: (string | number)[]
  button: WaTemplateButtonParam
}

/**
 * Every MPM button in a template's params, top-level or inside a carousel
 * card, with the path `ctx.addIssue` needs to point at the offending button.
 */
function collectMpmTargets(
  params: WaTemplateParams,
  basePath: (string | number)[],
): MpmValidationTarget[] {
  const topLevel = findMpmButtonParams(params.button).map((button) => ({
    path: [...basePath, "button"],
    button,
  }))

  const inCarousel = (params.carousel ?? []).flatMap((card, cardIndex) =>
    findMpmButtonParams(card.button).map((button) => ({
      path: [...basePath, "carousel", cardIndex, "button"],
      button,
    })),
  )

  return [...topLevel, ...inCarousel]
}

/**
 * Meta rejects an MPM button sent with `sections: []` (the extractor's
 * default before the section builder is configured) and rejects payloads
 * that exceed its section/product caps. Shared as a pure function — kept
 * apart from any single schema — so both the flow-step publish validator and
 * any future caller (e.g. broadcast validation) can reuse the exact same
 * rule without a second parallel implementation.
 */
export function validateMpmParams(
  params: WaTemplateParams,
  ctx: z.RefinementCtx,
  basePath: (string | number)[] = [],
): void {
  for (const target of collectMpmTargets(params, basePath)) {
    const sections = target.button.sections ?? []
    const productCount = countMpmProducts(sections)

    if (productCount === 0) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.waTemplateMpmNoProducts,
        path: target.path,
      })
      continue
    }

    if (sections.some(sectionHasBlankOrNoProducts)) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.waTemplateMpmIncompleteProducts,
        path: target.path,
      })
    }

    if (sections.length > waTemplateMpmLimits.maxSections) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.waTemplateMpmTooManySections,
        path: target.path,
      })
    }

    if (productCount > waTemplateMpmLimits.maxProductsTotal) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.waTemplateMpmTooManyProducts,
        path: target.path,
      })
    }
  }
}
