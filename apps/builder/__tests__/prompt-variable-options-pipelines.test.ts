import { PIPELINE_VARIABLE_ATTRIBUTES } from "@chatbotx.io/database/partials"
import { describe, expect, it } from "vitest"
import { buildPipelinePromptVariableOptions } from "@/components/tiptap/use-prompt-variable-options"

describe("buildPipelinePromptVariableOptions", () => {
  const options = buildPipelinePromptVariableOptions(
    [
      { name: "Sales", referenceName: "sales" },
      { name: "Support desk", referenceName: "support" },
    ],
    "Pipelines",
    (attribute) => `label:${attribute}`,
  )

  it("offers every attribute of every pipeline in the pipelines group", () => {
    expect(options).toHaveLength(2 * PIPELINE_VARIABLE_ATTRIBUTES.length)
    expect(new Set(options.map((option) => option.group))).toEqual(
      new Set(["Pipelines"]),
    )
  })

  it("inserts the readable reference name, never an id", () => {
    expect(options[0]).toEqual({
      group: "Pipelines",
      label: "Pipelines › Sales › label:name",
      value: "pipelines.sales.name",
    })
    expect(
      options.some(
        (option) => option.value === "pipelines.support.assigned_admins",
      ),
    ).toBe(true)
  })

  it("is empty without pipelines", () => {
    expect(buildPipelinePromptVariableOptions([], "Pipelines", String)).toEqual(
      [],
    )
  })
})
