import {
  CHANNEL_FLOW_POLICIES,
  flowValidationCodes,
  type SendProductsStepSchema,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  countProducts,
  resolveFieldRules,
  type SendProductsFormValues,
  switchDisplay,
  toFormValues,
  toStepFields,
  validateSendProductsForm,
} from "../lib/form"

const whatsappRules = CHANNEL_FLOW_POLICIES.whatsapp.productMessages?.displays

const step = (
  props: Partial<SendProductsStepSchema>,
): SendProductsStepSchema => ({
  id: "1",
  stepType: "sendProducts",
  display: "products",
  sections: [{ productIds: [] }],
  ...props,
})

const values = (
  props: Partial<SendProductsFormValues>,
): SendProductsFormValues => ({
  display: "products",
  header: "",
  body: "",
  footer: "",
  sections: [{ title: "", productIds: [] }],
  ...props,
})

describe("toFormValues / toStepFields", () => {
  test("round-trips a step, turning unset text into empty strings and back", () => {
    const original = step({
      body: "Hi",
      sections: [{ productIds: ["1", "2"] }],
    })

    expect(toFormValues(original)).toMatchObject({
      header: "",
      body: "Hi",
      footer: "",
    })
    expect(toStepFields(toFormValues(original))).toEqual({
      display: "products",
      header: undefined,
      body: "Hi",
      footer: undefined,
      sections: [{ title: undefined, productIds: ["1", "2"] }],
    })
  })

  test("a step with no sections still opens with one empty section", () => {
    expect(toFormValues(step({ sections: [] })).sections).toEqual([
      { title: "", productIds: [] },
    ])
  })

  test("trims text and drops blank titles", () => {
    expect(
      toStepFields(
        values({
          body: "  Hello  ",
          sections: [{ title: "   ", productIds: ["1"] }],
        }),
      ),
    ).toMatchObject({
      body: "Hello",
      sections: [{ title: undefined, productIds: ["1"] }],
    })
  })
})

describe("switchDisplay", () => {
  const start = values({
    header: "Picks",
    footer: "Free delivery",
    sections: [
      { title: "A", productIds: ["1", "2"] },
      { title: "B", productIds: ["3"] },
    ],
  })

  test("carousel flattens every product into one untitled section and drops header/footer", () => {
    expect(switchDisplay(start, "carousel")).toMatchObject({
      display: "carousel",
      header: "",
      footer: "",
      sections: [{ productIds: ["1", "2", "3"] }],
    })
  })

  test("back to products keeps the sections it has, or starts one", () => {
    expect(switchDisplay(start, "products").sections).toHaveLength(2)
    expect(
      switchDisplay(values({ display: "carousel", sections: [] }), "products")
        .sections,
    ).toEqual([{ productIds: [] }])
  })
})

describe("resolveFieldRules", () => {
  const productsRule = whatsappRules?.products

  test("a single product offers footer and body but no header", () => {
    const rules = resolveFieldRules(
      productsRule,
      values({ sections: [{ productIds: ["1"] }] }),
    )

    expect(rules.header).toBeUndefined()
    expect(rules.body).toBeDefined()
    expect(rules.footer).toBeDefined()
    expect(rules.hasRequiredText).toBe(false)
  })

  test("two products make header and body required", () => {
    const rules = resolveFieldRules(
      productsRule,
      values({ sections: [{ productIds: ["1", "2"] }] }),
    )

    expect(rules.header).toBeDefined()
    expect(rules.hasRequiredText).toBe(true)
  })

  test("a field with no rule on the display is never offered", () => {
    const rules = resolveFieldRules(
      whatsappRules?.carousel,
      values({ display: "carousel" }),
    )

    expect(rules.header).toBeUndefined()
    expect(rules.footer).toBeUndefined()
  })

  test("an unsupported display offers nothing", () => {
    expect(resolveFieldRules(undefined, values({}))).toMatchObject({
      header: undefined,
      body: undefined,
    })
  })
})

describe("validateSendProductsForm", () => {
  const validate = (formValues: SendProductsFormValues, channel = "whatsapp") =>
    validateSendProductsForm({
      channel,
      step: step({}),
      values: formValues,
    }).map((issue) => `${issue.path}:${issue.code}`)

  test("agrees with publish: one product with no text is valid", () => {
    expect(validate(values({ sections: [{ productIds: ["1"] }] }))).toEqual([])
  })

  test("reports each problem at the field it belongs to", () => {
    expect(
      validate(
        values({
          sections: [
            { title: "", productIds: ["1"] },
            { title: "B", productIds: ["2"] },
          ],
        }),
      ),
    ).toEqual([
      `header:${flowValidationCodes.sendProductsFieldRequired}`,
      `body:${flowValidationCodes.sendProductsFieldRequired}`,
      `sections.0.title:${flowValidationCodes.sendProductsFieldRequired}`,
    ])
  })

  test("flags an empty section and a repeated product", () => {
    expect(validate(values({ sections: [{ productIds: [] }] }))).toContain(
      `sections.0.productIds:${flowValidationCodes.sendProductsProductCountOutOfRange}`,
    )
    expect(
      validate(
        values({
          header: "h",
          body: "b",
          sections: [
            { title: "a", productIds: ["1"] },
            { title: "b", productIds: ["1"] },
          ],
        }),
      ),
    ).toContain(
      `sections.1.productIds:${flowValidationCodes.sendProductsDuplicateProduct}`,
    )
  })

  test("a channel with no product capability falls back to the structure-only rules", () => {
    expect(
      validate(values({ sections: [{ productIds: ["1"] }] }), "messenger"),
    ).toEqual([])
  })

  test("counts products across sections", () => {
    expect(
      countProducts(
        values({
          sections: [{ productIds: ["1", "2"] }, { productIds: ["3"] }],
        }),
      ),
    ).toBe(3)
  })
})
