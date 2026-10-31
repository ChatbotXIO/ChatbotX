// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

type Middleware = (input: {
  ctx: { workspaceMemberPermissions: Record<string, boolean> }
  next: (options: { ctx: unknown }) => unknown
}) => unknown

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    use: (middleware: Middleware) => ({ base: "normal", middleware }),
  },
  workspaceActionClientAllowExpired: {
    use: (middleware: Middleware) => ({ base: "allowExpired", middleware }),
  },
}))

const {
  assertCanViewInstalls,
  installerActionClient,
  installerActionClientAllowExpired,
} = await import("../src/features/templates/actions/installer-action-client")
const { templateActionClient, templateActionClientAllowExpired } = await import(
  "../src/features/templates/actions/template-action-client"
)

const baseOf = (client: object): unknown => Reflect.get(client, "base")

const runMiddleware = (
  client: unknown,
  permissions: Record<string, boolean>,
) => {
  const next = vi.fn((options: { ctx: unknown }) => options.ctx)
  const result = (client as { middleware: Middleware }).middleware({
    ctx: { workspaceMemberPermissions: permissions },
    next,
  })
  return { result, next }
}

describe("installer action clients", () => {
  test("read/delete-type installer actions stay available after a trial expires", () => {
    expect(baseOf(installerActionClientAllowExpired)).toBe("allowExpired")
    expect(baseOf(installerActionClient)).toBe("normal")
  })

  test("publisher delete-type actions are built on the allow-expired client too", () => {
    expect(baseOf(templateActionClientAllowExpired)).toBe("allowExpired")
    expect(baseOf(templateActionClient)).toBe("normal")
  })

  test("an ecommerce-only member passes and the template actor lands in the context", () => {
    const { result } = runMiddleware(installerActionClient, { ecommerce: true })

    expect(result).toEqual({
      templateActor: {
        kind: "member",
        permissions: { ecommerce: true },
      },
    })
  })

  test("a member with no template-related permission is refused with one shared code", () => {
    for (const client of [
      installerActionClient,
      installerActionClientAllowExpired,
    ]) {
      expect(() => runMiddleware(client, {})).toThrow(
        expect.objectContaining({ code: "templateCategoryPermissionDenied" }),
      )
    }
    expect(() => assertCanViewInstalls({})).toThrow(
      expect.objectContaining({ code: "templateCategoryPermissionDenied" }),
    )
  })

  test("the publisher client still needs the manage permission", () => {
    expect(() =>
      runMiddleware(templateActionClientAllowExpired, { ecommerce: true }),
    ).toThrow(
      expect.objectContaining({ code: "templateManagePermissionDenied" }),
    )
    expect(
      runMiddleware(templateActionClientAllowExpired, { flows: true }).result,
    ).toMatchObject({ templateActor: { kind: "member" } })
  })
})
