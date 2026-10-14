import {
  createStarterDefinition,
  defaultMiniAppText,
} from "@chatbotx.io/mini-app"
import { describe, expect, it } from "vitest"
import {
  createMiniAppEditorStore,
  resolveInsertTarget,
} from "@/features/mini-apps/editor/editor-store"

const threeScreens = () => {
  const store = createMiniAppEditorStore({
    name: "n",
    definition: createStarterDefinition("Welcome"),
  })
  store.getState().addScreen("B", defaultMiniAppText)
  store.getState().addScreen("C", defaultMiniAppText)
  return store
}

const titles = (store: ReturnType<typeof threeScreens>) =>
  store.getState().definition.screens.map((screen) => screen.title)

describe("mini app editor store", () => {
  it("moves a screen and records one undo step", () => {
    const store = threeScreens()
    const steps = store.getState().past.length
    store.getState().moveScreen(2, 0)
    expect(titles(store)).toEqual(["C", "Welcome", "B"])
    expect(store.getState().past).toHaveLength(steps + 1)
    store.getState().undo()
    expect(titles(store)).toEqual(["Welcome", "B", "C"])
  })

  it("ignores a move out of range without an undo step", () => {
    const store = threeScreens()
    const steps = store.getState().past.length
    store.getState().moveScreen(0, 5)
    expect(titles(store)).toEqual(["Welcome", "B", "C"])
    expect(store.getState().past).toHaveLength(steps)
  })

  it("adds a clicked component before the screen's Footer", () => {
    const definition = createStarterDefinition("Welcome")
    const screenKey = definition.screens[0]?.key as string
    expect(resolveInsertTarget(definition, screenKey, null)).toEqual({
      address: { screenKey },
      index: 1,
    })
  })
})
