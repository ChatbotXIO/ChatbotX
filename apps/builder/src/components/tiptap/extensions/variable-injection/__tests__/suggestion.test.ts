import type { SuggestionKeyDownProps } from "@tiptap/suggestion"
import { describe, expect, test } from "vitest"
import suggestion from "../suggestion"

const keyDown = (key: string) =>
  ({ event: new KeyboardEvent("keydown", { key }) }) as SuggestionKeyDownProps

describe("variable suggestion render", () => {
  const createRenderer = () => {
    const options = suggestion({ listOfPromptVariables: [] })
    const renderer = options?.render?.()
    if (!renderer) {
      throw new Error("suggestion has no renderer")
    }
    return renderer
  }

  // Tiptap only calls `onStart` once `items` has resolved, so a key pressed
  // right after typing `{{` reaches `onKeyDown` while nothing is mounted yet.
  test.each([
    "Escape",
    "ArrowDown",
    "Enter",
  ])("%s before the popup exists is ignored instead of throwing", (key) => {
    const renderer = createRenderer()

    expect(renderer.onKeyDown?.(keyDown(key))).toBe(false)
  })

  test("exiting before the popup was ever shown does not throw", () => {
    const renderer = createRenderer()

    expect(() =>
      renderer.onExit?.(
        {} as Parameters<NonNullable<typeof renderer.onExit>>[0],
      ),
    ).not.toThrow()
  })
})
