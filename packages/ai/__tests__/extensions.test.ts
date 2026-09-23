import { describe, expect, test } from "vitest"
import {
  allowableKnowledgeExtensionsMap,
  getAllowableKnowledgeExtensions,
} from "../src/schemas/extensions"

describe("knowledge file extensions", () => {
  test("allows JSON knowledge files", () => {
    expect(allowableKnowledgeExtensionsMap()["application/json"]).toEqual([
      ".json",
    ])
    expect(getAllowableKnowledgeExtensions()).toContain(".json")
  })
})
