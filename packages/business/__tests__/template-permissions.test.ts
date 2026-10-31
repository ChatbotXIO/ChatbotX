// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  assertCanManageTemplates,
  assertCanReadTemplateCategories,
  assertCanReadTemplates,
  assertCanUseTemplateCategories,
  canUseTemplateCategories,
  TEMPLATE_CATEGORY_PERMISSION,
  type TemplateActor,
} from "../src/template/permissions"

const member = (permissions: Record<string, boolean>): TemplateActor => ({
  kind: "member",
  permissions,
})

describe("template permissions", () => {
  test("managing templates needs the flows permission", () => {
    expect(() =>
      assertCanManageTemplates(member({ flows: true })),
    ).not.toThrow()
    expect(() => assertCanManageTemplates(member({ ecommerce: true }))).toThrow(
      expect.objectContaining({ code: "templateManagePermissionDenied" }),
    )
  })

  test("reading templates admits managers and every api token, not other members", () => {
    expect(() => assertCanReadTemplates(member({ flows: true }))).not.toThrow()
    expect(() =>
      assertCanReadTemplates({ kind: "apiToken", permission: "read_only" }),
    ).not.toThrow()
    expect(() =>
      assertCanReadTemplates({ kind: "apiToken", permission: "full" }),
    ).not.toThrow()
    expect(() => assertCanReadTemplates(member({ ecommerce: true }))).toThrow(
      expect.objectContaining({ code: "templateManagePermissionDenied" }),
    )
  })

  test("a read_only token still fails the manage check", () => {
    expect(() =>
      assertCanManageTemplates({ kind: "apiToken", permission: "read_only" }),
    ).toThrow(
      expect.objectContaining({ code: "templateManagePermissionDenied" }),
    )
  })

  test("the read category gate lets any token through but holds members to their permissions", () => {
    expect(() =>
      assertCanReadTemplateCategories(
        { kind: "apiToken", permission: "read_only" },
        { products: 2 },
      ),
    ).not.toThrow()
    expect(() =>
      assertCanReadTemplateCategories(member({ flows: true }), { products: 2 }),
    ).toThrow(
      expect.objectContaining({ code: "templateCategoryPermissionDenied" }),
    )
  })

  test("superAdmin bypasses every category check", () => {
    expect(
      canUseTemplateCategories(member({ superAdmin: true }), {
        products: 2,
        flows: 1,
      }),
    ).toBe(true)
  })

  test("a category with a non-zero count needs its mapped permission", () => {
    expect(() =>
      assertCanUseTemplateCategories(member({ flows: true }), {
        flows: 1,
        products: 3,
      }),
    ).toThrow(
      expect.objectContaining({ code: "templateCategoryPermissionDenied" }),
    )
  })

  test("a zero or absent count never requires its permission", () => {
    expect(
      canUseTemplateCategories(member({ flows: true }), {
        flows: 4,
        products: 0,
      }),
    ).toBe(true)
  })

  test("a product-only template needs ecommerce, not flows", () => {
    expect(
      canUseTemplateCategories(member({ ecommerce: true }), { products: 1 }),
    ).toBe(true)
  })

  test("a missing permission key fails closed", () => {
    expect(canUseTemplateCategories(member({}), { flows: 1 })).toBe(false)
  })

  test("an API token needs full access, read_only is rejected", () => {
    expect(
      canUseTemplateCategories(
        { kind: "apiToken", permission: "full" },
        {
          flows: 1,
        },
      ),
    ).toBe(true)
    expect(
      canUseTemplateCategories(
        { kind: "apiToken", permission: "read_only" },
        {
          flows: 1,
        },
      ),
    ).toBe(false)
  })

  test("products and product categories map to ecommerce", () => {
    expect(TEMPLATE_CATEGORY_PERMISSION.products).toBe("ecommerce")
    expect(TEMPLATE_CATEGORY_PERMISSION.productCategories).toBe("ecommerce")
  })
})
