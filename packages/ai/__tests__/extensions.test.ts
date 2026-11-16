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

  test("derives every knowledge extension from the sdk map", () => {
    const map = allowableKnowledgeExtensionsMap()
    expect(map["text/markdown"]).toEqual([".md", ".markdown"])
    expect(map["text/html"]).toEqual([".html", ".htm"])
    expect(getAllowableKnowledgeExtensions().split(",")).toEqual(
      expect.arrayContaining([".pdf", ".docx", ".xlsx", ".pptx", ".epub"]),
    )
  })
})
