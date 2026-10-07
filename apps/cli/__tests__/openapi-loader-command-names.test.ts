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

describe("pathAndMethodToCommandName — operations that used to collide get distinct names", () => {
  test("clearing ONE custom field and clearing ALL of them are different commands", () => {
    const clearOne = pathAndMethodToCommandName(
      "/v1/contacts/{identifier}/custom-fields/{idOrName}",
      "DELETE",
    )
    const clearAll = pathAndMethodToCommandName(
      "/v1/contacts/{identifier}/custom-fields",
      "DELETE",
    )

    expect(clearOne).toBe("contacts:custom-field:delete")
    expect(clearAll).toBe("contacts:clear-all-custom-fields")
  })

  test("setting one custom field no longer collides with the batch operations", () => {
    expect(
      pathAndMethodToCommandName(
        "/v1/contacts/{identifier}/custom-fields",
        "PATCH",
      ),
    ).toBe("contacts:custom-fields:update")
    expect(
      pathAndMethodToCommandName(
        "/v1/contacts/{identifier}/custom-fields/{idOrName}",
        "PUT",
      ),
    ).toBe("contacts:set-custom-field")
  })

  test("bot-fields: the batch keeps `update`, one field is `set`, PATCH is `edit`", () => {
    expect(pathAndMethodToCommandName("/v1/bot-fields", "PUT")).toBe(
      "bot-fields:update",
    )
    expect(pathAndMethodToCommandName("/v1/bot-fields/{idOrName}", "PUT")).toBe(
      "bot-fields:set",
    )
    expect(
      pathAndMethodToCommandName("/v1/bot-fields/{idOrName}", "PATCH"),
    ).toBe("bot-fields:edit")
  })

  test("partial settings updates do not collide with the full replace", () => {
    expect(
      pathAndMethodToCommandName(
        "/v1/messenger-channels/{id}/settings",
        "PATCH",
      ),
    ).toBe("messenger-channels:settings:edit")
    expect(
      pathAndMethodToCommandName(
        "/v1/instagram-channels/{id}/settings",
        "PATCH",
      ),
    ).toBe("instagram-channels:settings:edit")
    expect(
      pathAndMethodToCommandName(
        "/v1/inboxes/{inboxId}/ai-handover/settings",
        "PATCH",
      ),
    ).toBe("inboxes:settings:edit")
  })

  test("bulk tag removal has its own command", () => {
    expect(
      pathAndMethodToCommandName("/v1/contacts/bulk/tags/remove", "POST"),
    ).toBe("contacts:bulk-tags-remove")
  })

  test("ads and flow-stats operations each get their own command", () => {
    const names = [
      pathAndMethodToCommandName("/v1/ads/campaigns", "GET"),
      pathAndMethodToCommandName("/v1/ads/campaigns", "POST"),
      pathAndMethodToCommandName("/v1/ads/conversion-rules", "GET"),
      pathAndMethodToCommandName("/v1/ads/conversion-rules", "POST"),
      pathAndMethodToCommandName("/v1/ads/conversion-rules/{id}", "GET"),
      pathAndMethodToCommandName("/v1/ads/conversion-rules/{id}", "PATCH"),
      pathAndMethodToCommandName("/v1/ads/conversion-rules/{id}", "DELETE"),
      pathAndMethodToCommandName("/v1/analytics/flows/{flowId}/stats", "GET"),
      pathAndMethodToCommandName(
        "/v1/analytics/flows/{flowId}/stats",
        "DELETE",
      ),
    ]

    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain("ads:create-campaign")
    expect(names).toContain("ads:create-conversion-rule")
    expect(names).toContain("ads:update-conversion-rule")
    expect(names).toContain("ads:delete-conversion-rule")
    expect(names).toContain("analytics:reset-flow-stats")
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

describe("pathAndMethodToCommandName — products imports collection", () => {
  test("list (GET) and start (POST) on the same path get distinct commands", () => {
    expect(pathAndMethodToCommandName("/v1/products/imports", "GET")).toBe(
      "products:imports:list",
    )
    expect(pathAndMethodToCommandName("/v1/products/imports", "POST")).toBe(
      "products:imports:create",
    )
  })

  test("one job is still found by id", () => {
    expect(pathAndMethodToCommandName("/v1/products/imports/{id}", "GET")).toBe(
      "products:find-by-imports",
    )
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
