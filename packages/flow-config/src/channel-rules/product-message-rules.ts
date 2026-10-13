import type { z } from "zod"
import type {
  SendProductsDisplay,
  SendProductsStepSchema,
} from "../steps/send-products"
import {
  type FlowValidationCode,
  flowValidationCodes,
} from "../validation-codes"
import { countMessageCharacters } from "./characters"

/**
 * When a product-message field applies, relative to the message's contents.
 * The one vocabulary every channel declares its rules in, so a new channel is a
 * new table of data rather than new code.
 */
export const productMessageConditions = [
  "always",
  "never",
  "multipleProducts",
  "multipleSections",
] as const
export type ProductMessageCondition = (typeof productMessageConditions)[number]

export type ProductMessageTextRule = {
  max: number
  allowedWhen: ProductMessageCondition
  requiredWhen: ProductMessageCondition
}

/** A field with no rule is not allowed on that display. */
export type ProductDisplayRule = {
  minProducts: number
  maxProducts: number
  maxSections: number
  header?: ProductMessageTextRule
  body?: ProductMessageTextRule
  footer?: ProductMessageTextRule
  sectionTitle?: ProductMessageTextRule
  thumbnail: boolean
}

/** A display with no rule is unsupported on that channel. */
export type ProductMessageCapability = {
  displays: Partial<Record<SendProductsDisplay, ProductDisplayRule>>
}

/**
 * What the rules are evaluated against. Deliberately not the step schema: the
 * same rules also vet the message resolved at send time, after products that no
 * longer exist were dropped.
 */
export type ProductMessageShape = {
  display: SendProductsDisplay
  header?: string
  body?: string
  footer?: string
  sections: ReadonlyArray<{ title?: string; productCount: number }>
  hasThumbnail: boolean
}

export type ProductMessageIssue = {
  code: FlowValidationCode
  path: ReadonlyArray<string | number>
}

export type ProductMessageContext = {
  productCount: number
  sectionCount: number
}

export const productMessageConditionHolds: Record<
  ProductMessageCondition,
  (context: ProductMessageContext) => boolean
> = {
  always: () => true,
  never: () => false,
  multipleProducts: ({ productCount }) => productCount > 1,
  multipleSections: ({ sectionCount }) => sectionCount > 1,
}

const textFields = ["header", "body", "footer"] as const

const hasText = (value: string | undefined): value is string =>
  Boolean(value?.trim())

const evaluateText = (props: {
  value: string | undefined
  rule: ProductMessageTextRule | undefined
  context: ProductMessageContext
  path: ProductMessageIssue["path"]
}): ProductMessageIssue[] => {
  const { value, rule, context, path } = props
  const present = hasText(value)
  if (!rule) {
    return present
      ? [{ code: flowValidationCodes.sendProductsFieldNotAllowed, path }]
      : []
  }
  if (present && !productMessageConditionHolds[rule.allowedWhen](context)) {
    return [{ code: flowValidationCodes.sendProductsFieldNotAllowed, path }]
  }
  if (present && countMessageCharacters(value.trim()) > rule.max) {
    return [{ code: flowValidationCodes.sendProductsFieldTooLong, path }]
  }
  if (!present && productMessageConditionHolds[rule.requiredWhen](context)) {
    return [{ code: flowValidationCodes.sendProductsFieldRequired, path }]
  }
  return []
}

export const evaluateProductMessage = (
  capability: ProductMessageCapability,
  shape: ProductMessageShape,
): ProductMessageIssue[] => {
  const rule = capability.displays[shape.display]
  if (!rule) {
    return [
      {
        code: flowValidationCodes.sendProductsDisplayUnsupported,
        path: ["display"],
      },
    ]
  }

  const context: ProductMessageContext = {
    productCount: shape.sections.reduce(
      (total, section) => total + section.productCount,
      0,
    ),
    sectionCount: shape.sections.length,
  }

  const issues: ProductMessageIssue[] = []
  if (
    context.productCount < rule.minProducts ||
    context.productCount > rule.maxProducts
  ) {
    issues.push({
      code: flowValidationCodes.sendProductsProductCountOutOfRange,
      path: ["sections"],
    })
  }
  if (context.sectionCount > rule.maxSections) {
    issues.push({
      code: flowValidationCodes.sendProductsSectionCountOutOfRange,
      path: ["sections"],
    })
  }
  for (const field of textFields) {
    issues.push(
      ...evaluateText({
        value: shape[field],
        rule: rule[field],
        context,
        path: [field],
      }),
    )
  }
  shape.sections.forEach((section, sectionIndex) => {
    issues.push(
      ...evaluateText({
        value: section.title,
        rule: rule.sectionTitle,
        context,
        path: ["sections", sectionIndex, "title"],
      }),
    )
  })
  if (shape.hasThumbnail && !rule.thumbnail) {
    issues.push({
      code: flowValidationCodes.sendProductsThumbnailNotAllowed,
      path: ["thumbnailProductId"],
    })
  }
  return issues
}

export const toProductMessageShape = (
  step: SendProductsStepSchema,
): ProductMessageShape => ({
  display: step.display,
  header: step.header,
  body: step.body,
  footer: step.footer,
  sections: step.sections.map((section) => ({
    title: section.title,
    productCount: section.productIds.length,
  })),
  hasThumbnail: Boolean(step.thumbnailProductId),
})

/** zod adapter: the evaluator itself stays free of zod so `business` can reuse it. */
export const refineProductMessage =
  (capability: ProductMessageCapability) =>
  (step: SendProductsStepSchema, ctx: z.RefinementCtx): void => {
    for (const issue of evaluateProductMessage(
      capability,
      toProductMessageShape(step),
    )) {
      ctx.addIssue({
        code: "custom",
        path: [...issue.path],
        message: issue.code,
      })
    }
  }
