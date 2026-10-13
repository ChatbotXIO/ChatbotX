import {
  channelAwareStepValidators,
  type FlowValidationCode,
  isFlowValidationCode,
  type ProductDisplayRule,
  type ProductMessageTextRule,
  productMessageConditionHolds,
  resolveStepValidator,
  type SendProductsDisplay,
  type SendProductsStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"

export type SendProductsFormValues = Pick<
  SendProductsStepSchema,
  "display" | "header" | "body" | "footer" | "sections" | "thumbnailProductId"
>

export type SendProductsFormIssue = {
  /** Dotted path into the form values, e.g. `sections.1.title`. */
  path: string
  code: FlowValidationCode
}

/** A catalog holds no products; every other display opens with at least one section to fill. */
const initialSections = (
  step: SendProductsStepSchema,
): SendProductsFormValues["sections"] => {
  if (step.display === "catalog") {
    return []
  }
  return step.sections.length > 0
    ? step.sections
    : [{ title: "", productIds: [] }]
}

export const toFormValues = (
  step: SendProductsStepSchema,
): SendProductsFormValues => ({
  display: step.display,
  header: step.header ?? "",
  body: step.body ?? "",
  footer: step.footer ?? "",
  sections: initialSections(step),
  thumbnailProductId: step.thumbnailProductId,
})

const blankToUndefined = (value: string | undefined) =>
  value?.trim() || undefined

/** What the step stores: trimmed text, no empty strings standing in for "unset". */
export const toStepFields = (
  values: SendProductsFormValues,
): Omit<SendProductsFormValues, "sections"> & {
  sections: SendProductsStepSchema["sections"]
} => ({
  display: values.display,
  header: blankToUndefined(values.header),
  body: blankToUndefined(values.body),
  footer: blankToUndefined(values.footer),
  sections:
    values.display === "catalog"
      ? []
      : values.sections.map((section) => ({
          title: blankToUndefined(section.title),
          productIds: section.productIds,
        })),
  thumbnailProductId: values.thumbnailProductId || undefined,
})

export const countProducts = (values: SendProductsFormValues): number =>
  values.sections.reduce(
    (total, section) => total + section.productIds.length,
    0,
  )

/**
 * Moves the values to another display, keeping what still means something
 * there: carousel is one flat list, catalog holds no products.
 */
export const switchDisplay = (
  values: SendProductsFormValues,
  display: SendProductsDisplay,
): SendProductsFormValues => {
  const allProductIds = values.sections.flatMap((section) => section.productIds)
  switch (display) {
    case "carousel":
      return {
        ...values,
        display,
        header: "",
        footer: "",
        thumbnailProductId: undefined,
        sections: [{ productIds: allProductIds }],
      }
    case "catalog":
      return { ...values, display, header: "", sections: [] }
    default:
      return {
        ...values,
        display,
        thumbnailProductId: undefined,
        sections:
          values.sections.length > 0 ? values.sections : [{ productIds: [] }],
      }
  }
}

export type FieldRules = {
  header?: ProductMessageTextRule
  body?: ProductMessageTextRule
  footer?: ProductMessageTextRule
  sectionTitle?: ProductMessageTextRule
  thumbnail: boolean
  /** Which of the fields above must be filled right now. */
  required: {
    header: boolean
    body: boolean
    footer: boolean
    sectionTitle: boolean
  }
  /** A text field that must be filled, so it can never be tucked away. */
  hasRequiredText: boolean
}

/**
 * The fields to show, given the products picked so far. A field the message no
 * longer allows stays on screen while it still holds text: it is what the
 * "can't be used here" message points at, and the author has to be able to
 * clear it.
 */
export const resolveFieldRules = (
  rule: ProductDisplayRule | undefined,
  values: SendProductsFormValues,
): FieldRules => {
  const context = {
    productCount: countProducts(values),
    sectionCount: values.sections.length,
  }
  const visible = (
    textRule: ProductMessageTextRule | undefined,
    hasText: boolean,
  ) =>
    textRule &&
    (hasText || productMessageConditionHolds[textRule.allowedWhen](context))
      ? textRule
      : undefined
  const isRequired = (textRule: ProductMessageTextRule | undefined) =>
    Boolean(
      textRule && productMessageConditionHolds[textRule.requiredWhen](context),
    )
  const header = visible(rule?.header, Boolean(values.header?.trim()))
  const body = visible(rule?.body, Boolean(values.body?.trim()))
  const footer = visible(rule?.footer, Boolean(values.footer?.trim()))
  const sectionTitle = visible(
    rule?.sectionTitle,
    values.sections.some((section) => Boolean(section.title?.trim())),
  )
  const required = {
    header: isRequired(header),
    body: isRequired(body),
    footer: isRequired(footer),
    sectionTitle: isRequired(sectionTitle),
  }
  return {
    header,
    body,
    footer,
    sectionTitle,
    thumbnail: Boolean(rule?.thumbnail),
    required,
    hasRequiredText: Object.values(required).some(Boolean),
  }
}

/** Validates the way publish does, so the dialog and the publish step agree. */
export const validateSendProductsForm = (props: {
  channel: string
  step: SendProductsStepSchema
  values: SendProductsFormValues
}): SendProductsFormIssue[] => {
  const validator = channelAwareStepValidators[stepTypes.enum.sendProducts]
  if (!validator) {
    return []
  }
  const result = resolveStepValidator(validator, props.channel).safeParse({
    ...props.step,
    ...toStepFields(props.values),
  })
  if (result.success) {
    return []
  }
  return result.error.issues.flatMap((issue) =>
    isFlowValidationCode(issue.message)
      ? [{ path: issue.path.join("."), code: issue.message }]
      : [],
  )
}

export const displayLabelKey = {
  products: "flows.sendProducts.displays.products",
  carousel: "flows.sendProducts.displays.carousel",
  catalog: "flows.sendProducts.displays.catalog",
} as const satisfies Record<SendProductsDisplay, string>

export const sendProductsDisplayOrder: readonly SendProductsDisplay[] = [
  "products",
  "carousel",
  "catalog",
]
