import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

describe("muse provider registration", () => {
  test("appears in the perform-action AI provider menu", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/nodes/perform-action/menu.tsx",
      "utf8",
    )
    expect(source).toContain('providerKey: "muse"')
  })

  test("is listed right after OpenAI and before Claude", () => {
    const menu = readFileSync(
      "src/features/flows/react-flow/nodes/perform-action/menu.tsx",
      "utf8",
    )
    const registry = readFileSync(
      "src/features/integrations/settings-registry.ts",
      "utf8",
    )
    const order = (source: string, keys: string[]) =>
      keys.map((key) => source.indexOf(key))

    const [menuOpenai, menuMuse, menuClaude] = order(menu, [
      'providerKey: "openai"',
      'providerKey: "muse"',
      'providerKey: "claude"',
    ])
    expect(menuOpenai).toBeLessThan(menuMuse)
    expect(menuMuse).toBeLessThan(menuClaude)

    const [registryOpenai, registryMuse, registryNext] = order(registry, [
      'slug: "openai"',
      'slug: "muse"',
      'slug: "gemini"',
    ])
    expect(registryOpenai).toBeLessThan(registryMuse)
    expect(registryMuse).toBeLessThan(registryNext)
    expect(registryMuse).toBeLessThan(registry.indexOf('slug: "claude"'))
  })

  test("offers Muse models in the analyze-image model select", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/steps/ai-analyze-image/components/ai-model-select.tsx",
      "utf8",
    )
    expect(source).toContain("muse: museAnalyzeImageModelOptions")
  })

  test("offers the Muse image model and Muse sizes in the generate-image editor", () => {
    const modelSelect = readFileSync(
      "src/features/flows/react-flow/steps/ai-generate-image/components/ai-model-select.tsx",
      "utf8",
    )
    const sizeSelect = readFileSync(
      "src/features/flows/react-flow/steps/ai-generate-image/constants.tsx",
      "utf8",
    )
    expect(modelSelect).toContain("muse: museImageModelOptions")
    expect(sizeSelect).toContain("muse: [")
  })

  test("offers Speech to Text, but not Text to Speech, under Muse", () => {
    const menu = readFileSync(
      "src/features/flows/react-flow/nodes/perform-action/menu.tsx",
      "utf8",
    )
    const start = menu.indexOf('providerKey: "muse"')
    const museBlock = menu.slice(start, menu.indexOf("providerKey:", start + 1))

    expect(museBlock).toContain("stepTypes.enum.aiSpeechToText")
    expect(museBlock).not.toContain("stepTypes.enum.aiTextToSpeech")
  })
})
