import { templateResourceCategories } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { TOOL_TEMPLATE_COVERAGE } from "@/features/tools/tool-template-coverage"
import { TOOLS_CONFIG } from "@/features/tools/tools-list"

describe("tool template coverage", () => {
  test("every Tools card declares what a template does with it", () => {
    expect(Object.keys(TOOL_TEMPLATE_COVERAGE).sort()).toEqual(
      TOOLS_CONFIG.map((tool) => tool.id).sort(),
    )
  })

  test("a covered tool names real template categories", () => {
    for (const coverage of Object.values(TOOL_TEMPLATE_COVERAGE)) {
      if ("categories" in coverage) {
        for (const category of coverage.categories) {
          expect(templateResourceCategories.options).toContain(category)
        }
      }
    }
  })
})
