// @vitest-environment node

import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, test } from "vitest"
import { MOBILE_MEMBER_ROUTES } from "@/lib/mobile-auth/member-route-allowlist"

/**
 * Source-level guards for the mobile (member) surface. A mobile JWT acts as a
 * workspace member, so every route it may reach must (a) really exist and
 * (b) apply member scoping. These tests fail when a route in the allowlist is
 * renamed away, or when a contact-addressed public route skips the scoped
 * resolver and would leak contacts outside an agent's assigned scope.
 */

const SRC = join(import.meta.dirname, "..", "src")
const posix = (path: string) => relative(SRC, path).split(sep).join("/")

const publicApiFiles = (dir: string, found: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") {
        publicApiFiles(full, found)
      }
    } else if (
      entry.name.endsWith(".ts") &&
      posix(full).includes("/api/") &&
      (entry.name.startsWith("public") || posix(full).includes("/api/public/"))
    ) {
      found.push(full)
    }
  }
  return found
}

const files = [
  ...publicApiFiles(join(SRC, "features")),
  ...publicApiFiles(join(SRC, "enterprise")),
]

const ROUTE_PATTERN = /method:\s*"([A-Z]+)",\s*path:\s*"([^"]+)"/g

const declaredRoutes = new Set(
  files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(ROUTE_PATTERN)].map(
      (match) => `${match[1]} ${match[2]}`,
    ),
  ),
)

describe("mobile member route allowlist", () => {
  test("scans a realistic number of public API files", () => {
    expect(files.length).toBeGreaterThan(30)
    expect(declaredRoutes.size).toBeGreaterThan(300)
  })

  test("every allowlisted route is a declared public operation", () => {
    const missing = MOBILE_MEMBER_ROUTES.filter(
      (route) => !declaredRoutes.has(route),
    )

    expect(missing).toEqual([])
  })

  test("has no duplicates", () => {
    expect(new Set(MOBILE_MEMBER_ROUTES).size).toBe(MOBILE_MEMBER_ROUTES.length)
  })
})

describe("contact-addressed public routes resolve the contact through the scoped helper", () => {
  // Routes that take a contact `identifier` and are NOT reachable by a mobile
  // member (not in MOBILE_MEMBER_ROUTES): the middleware refuses them before
  // the handler runs, so they may still resolve the identifier directly. Adding
  // a file here is a deliberate decision that no mobile route lives in it.
  const NOT_MOBILE_REACHABLE = new Set([
    "features/discount-codes/api/public.ts",
    "features/pipelines/api/public.ts",
    "features/coupons/api/public.ts",
    "features/webshop/api/public.ts",
    "features/orders/api/public.ts",
  ])

  test("no other public API file calls contactService.resolveIdByIdentifier directly", () => {
    const offenders = files
      .map((file) => posix(file))
      .filter((path) => !NOT_MOBILE_REACHABLE.has(path))
      .filter((path) =>
        readFileSync(join(SRC, path), "utf8").includes(
          "contactService.resolveIdByIdentifier(",
        ),
      )

    expect(offenders).toEqual([])
  })

  test("none of the files exempted above defines a mobile-allowlisted route", () => {
    const allowlistedPaths = new Set(
      MOBILE_MEMBER_ROUTES.map((route) => route.split(" ")[1]),
    )
    for (const path of NOT_MOBILE_REACHABLE) {
      const source = readFileSync(join(SRC, path), "utf8")
      const defined = [...source.matchAll(ROUTE_PATTERN)].map(
        (match) => match[2],
      )
      expect(defined.filter((route) => allowlistedPaths.has(route))).toEqual([])
    }
  })
})

describe("data-bearing mobile routes apply member scoping", () => {
  const SCOPED_HELPER_FILES = [
    "features/conversations/api/public.ts",
    "features/messages/api/public.ts",
    "features/contacts/api/public/crud.ts",
    "features/contacts/api/public/tags.ts",
    "features/contacts/api/public/custom-fields.ts",
    "features/contacts/api/public/messages.ts",
    "features/contact-sequences/api/public.ts",
  ]

  test.each(SCOPED_HELPER_FILES)("%s uses the member-scope helpers", (path) => {
    expect(readFileSync(join(SRC, path), "utf8")).toContain(
      "@/lib/public-api/member-scope",
    )
  })

  test("the contact list/count routes never hard-code an unscoped read", () => {
    const crud = readFileSync(
      join(SRC, "features/contacts/api/public/crud.ts"),
      "utf8",
    )

    expect(crud).not.toContain("UNSCOPED")
    expect(crud).not.toContain('scope: "unscoped"')
  })
})
