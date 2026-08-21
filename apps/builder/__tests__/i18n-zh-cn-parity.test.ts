// @vitest-environment node
import { expect, test } from "vitest"
import { messagesByLocale } from "@/i18n/messages"

type FlatMessages = Record<string, unknown>

const flattenMessages = (
  value: unknown,
  prefix = "",
  result: FlatMessages = {},
): FlatMessages => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    result[prefix] = value
    return result
  }

  for (const [key, child] of Object.entries(value)) {
    flattenMessages(child, prefix ? `${prefix}.${key}` : key, result)
  }

  return result
}

test("zh-CN has the exact English key set", () => {
  expect(
    Object.keys(flattenMessages(messagesByLocale["zh-CN"])).sort(),
  ).toEqual(Object.keys(flattenMessages(messagesByLocale.en)).sort())
})
