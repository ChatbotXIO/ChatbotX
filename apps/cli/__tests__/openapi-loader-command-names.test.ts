import { describe, expect, test } from "vitest"
import { pathAndMethodToCommandName } from "../src/openapi-loader"

// `pathAndMethodToCommandName` had zero test coverage before this file, even
// though it silently drops one operation's CLI command whenever two distinct
// {path, method} pairs reduce to the same derived name (`toolsToCommands`
// keeps the first, skips the rest with a stderr warning — see the CLI
// README's "Known command-name collisions" section). These tests pin the
// current, documented behavior — including the still-open collisions — so a
// future change to the naming algorithm is a deliberate, reviewed diff
// against a known baseline instead of a silent command-surface change.

describe("pathAndMethodToCommandName — single-segment resource", () => {
  test("GET on a plain collection resource is list", () => {
    expect(pathAndMethodToCommandName("/v1/tags", "GET")).toBe("tags:list")
  })

  test("POST on a plain collection resource is create", () => {
    expect(pathAndMethodToCommandName("/v1/tags", "POST")).toBe("tags:create")
  })
})

describe("pathAndMethodToCommandName — resource/{id}", () => {
  test("GET on resource/{id} is get", () => {
    expect(pathAndMethodToCommandName("/v1/tags/{id}", "GET")).toBe("tags:get")
  })

  test("PATCH on resource/{id} is update", () => {
    expect(pathAndMethodToCommandName("/v1/tags/{id}", "PATCH")).toBe(
      "tags:update",
    )
  })

  test("DELETE on resource/{id} is delete", () => {
    expect(pathAndMethodToCommandName("/v1/tags/{id}", "DELETE")).toBe(
      "tags:delete",
    )
  })
})

describe("pathAndMethodToCommandName — GET distinguishes a sub-resource's own id from its collection", () => {
  test("GET on a nested collection (no trailing param) is a plural list", () => {
    expect(
      pathAndMethodToCommandName(
        "/v1/contacts/{identifier}/custom-fields",
        "GET",
      ),
    ).toBe("contacts:custom-fields:list")
  })

  test("GET on a nested resource's own id (trailing param) is a singular get", () => {
    expect(
      pathAndMethodToCommandName(
        "/v1/contacts/{identifier}/custom-fields/{idOrName}",
        "GET",
      ),
    ).toBe("contacts:custom-field:get")
  })
})

describe("pathAndMethodToCommandName — known collision: contacts custom-fields PUT/PATCH", () => {
  // Documented in apps/cli/README.md under "Known command-name collisions".
  // Unlike the GET branch above, PUT/PATCH do not fold in whether the last
  // path segment is itself a param, so both routes below reduce to the same
  // name — `applyCustomFieldOperations` (registered first, at the plural
  // no-trailing-param path) wins; `setCustomField` (singular, trailing-param
  // path) has no reachable CLI command.
  test("PATCH on the plural collection path and PUT on the singular {idOrName} path collide", () => {
    const patchName = pathAndMethodToCommandName(
      "/v1/contacts/{identifier}/custom-fields",
      "PATCH",
    )
    const putName = pathAndMethodToCommandName(
      "/v1/contacts/{identifier}/custom-fields/{idOrName}",
      "PUT",
    )

    expect(patchName).toBe("contacts:custom-fields:update")
    expect(putName).toBe("contacts:custom-fields:update")
    expect(patchName).toBe(putName)
  })
})

describe("pathAndMethodToCommandName — known collision: bot-fields PUT", () => {
  test("PUT on the collection and PUT on {idOrName} collide the same way", () => {
    const setManyName = pathAndMethodToCommandName("/v1/bot-fields", "PUT")
    const setOneName = pathAndMethodToCommandName(
      "/v1/bot-fields/{idOrName}",
      "PUT",
    )

    expect(setManyName).toBe("bot-fields:update")
    expect(setOneName).toBe("bot-fields:update")
    expect(setManyName).toBe(setOneName)
  })
})

describe("pathAndMethodToCommandName — filter/variant on a collection", () => {
  test("a literal second segment with no trailing param joins as a hyphenated action", () => {
    expect(
      pathAndMethodToCommandName("/v1/integrations/status/token-errors", "GET"),
    ).toBe("integrations:status-token-errors")
  })

  test("a literal second segment ending in a param becomes find-by-<action>", () => {
    expect(pathAndMethodToCommandName("/v1/tags/name/{name}", "GET")).toBe(
      "tags:find-by-name",
    )
  })
})

describe("pathAndMethodToCommandName — coupon import/export operations", () => {
  test("keeps the new coupon commands distinct", () => {
    const commandNames = [
      pathAndMethodToCommandName(
        "/v1/coupon-topics/{topicId}/coupons/bulk",
        "POST",
      ),
      pathAndMethodToCommandName("/v1/coupon-imports/upload-url", "POST"),
      pathAndMethodToCommandName("/v1/coupon-imports", "POST"),
      pathAndMethodToCommandName("/v1/coupon-exports", "POST"),
      pathAndMethodToCommandName("/v1/coupon-exports/{fileId}", "GET"),
    ]

    expect(commandNames).toEqual([
      "coupon-topics:bulk:add",
      "coupon-imports:upload-url",
      "coupon-imports:create",
      "coupon-exports:create",
      "coupon-exports:get",
    ])
    expect(new Set(commandNames)).toHaveLength(commandNames.length)
  })
})

describe("pathAndMethodToCommandName — bot field reset", () => {
  test("POST resource/{id}/reset collapses to group:reset", () => {
    expect(
      pathAndMethodToCommandName("/v1/bot-fields/{idOrName}/reset", "POST"),
    ).toBe("bot-fields:reset")
  })

  test("the bulk route keeps its own name instead of colliding with the single reset", () => {
    expect(
      pathAndMethodToCommandName("/v1/bot-fields/bulk-reset", "POST"),
    ).toBe("bot-fields:bulk-reset")
  })
})

describe("pathAndMethodToCommandName — workspace settings singleton", () => {
  test("GET and PATCH on the same path get distinct commands", () => {
    expect(pathAndMethodToCommandName("/v1/workspace/settings", "GET")).toBe(
      "workspace:settings:get",
    )
    expect(pathAndMethodToCommandName("/v1/workspace/settings", "PATCH")).toBe(
      "workspace:settings:update",
    )
  })
})

describe("pathAndMethodToCommandName — messenger templates by id", () => {
  test("GET and DELETE on the same path get distinct commands", () => {
    expect(
      pathAndMethodToCommandName("/v1/messenger/templates/{id}", "GET"),
    ).toBe("messenger:templates:get")
    expect(
      pathAndMethodToCommandName("/v1/messenger/templates/{id}", "DELETE"),
    ).toBe("messenger:templates:delete")
  })
})

describe("pathAndMethodToCommandName — meta catalog singleton", () => {
  test("GET (state) and POST (create) get distinct commands", () => {
    expect(pathAndMethodToCommandName("/v1/products/meta-catalog", "GET")).toBe(
      "products:meta-catalog:get",
    )
    expect(
      pathAndMethodToCommandName("/v1/products/meta-catalog", "POST"),
    ).toBe("products:meta-catalog:create")
  })
})
