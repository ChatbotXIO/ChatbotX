import { describe, expect, test } from "vitest"
import { pathAndMethodToCommandName } from "../src/openapi-loader"

const feedOperations: readonly (readonly [string, string, string])[] = [
  ["GET", "/v1/post-feeds", "post-feeds:list"],
  ["POST", "/v1/post-feeds", "post-feeds:create"],
  ["POST", "/v1/post-feeds/preview", "post-feeds:preview"],
  ["POST", "/v1/post-feeds/bulk-delete", "post-feeds:bulk-delete"],
  ["GET", "/v1/post-feeds/{id}", "post-feeds:get"],
  ["PATCH", "/v1/post-feeds/{id}", "post-feeds:update"],
  ["DELETE", "/v1/post-feeds/{id}", "post-feeds:delete"],
  ["POST", "/v1/post-feeds/{id}/pause", "post-feeds:pause"],
  ["POST", "/v1/post-feeds/{id}/resume", "post-feeds:resume"],
  ["POST", "/v1/post-feeds/{id}/check", "post-feeds:check"],
  ["GET", "/v1/post-feeds/{id}/items", "post-feeds:list-items"],
]

describe("post feed command names", () => {
  test.each(feedOperations)("%s %s is `%s`", (method, path, expected) => {
    expect(pathAndMethodToCommandName(path, method)).toBe(expected)
  })

  test("no two feed operations share a command name", () => {
    const names = feedOperations.map(([method, path]) =>
      pathAndMethodToCommandName(path, method),
    )

    expect(new Set(names).size).toBe(names.length)
  })
})
