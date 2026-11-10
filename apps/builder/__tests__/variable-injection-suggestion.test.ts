import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ReactRenderer: vi.fn(
    class {
      element = {}
      ref = null
      updateProps = vi.fn()
      destroy = vi.fn()
    },
  ),
  tippy: vi.fn(),
  popup: { destroy: vi.fn(), setProps: vi.fn(), hide: vi.fn() },
}))

vi.mock("@tiptap/react", () => ({ ReactRenderer: mocks.ReactRenderer }))
vi.mock("tippy.js", () => ({ default: mocks.tippy }))
vi.mock(
  "@/components/tiptap/extensions/variable-injection/variable-list",
  () => ({
    default: () => null,
  }),
)

const { default: suggestion } = await import(
  "@/components/tiptap/extensions/variable-injection/suggestion"
)

type RenderHandlers = NonNullable<
  ReturnType<NonNullable<ReturnType<typeof suggestion>>["render"] & {}>
>

const startProps = (isDestroyed: boolean) =>
  ({ editor: { isDestroyed }, clientRect: () => new DOMRect() }) as never

const newRenderHandlers = (): RenderHandlers => {
  const render = suggestion({ listOfPromptVariables: [] })?.render
  if (!render) {
    throw new Error("suggestion has no render")
  }
  return render()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tippy.mockReturnValue(mocks.popup)
})

describe("variable suggestion render", () => {
  test("opens the popup for a live editor", () => {
    const handlers = newRenderHandlers()

    handlers.onStart?.(startProps(false))

    expect(mocks.ReactRenderer).toHaveBeenCalledTimes(1)
    expect(mocks.tippy).toHaveBeenCalledTimes(1)
  })

  test("opens nothing when the editor was destroyed while the items loaded", () => {
    const handlers = newRenderHandlers()

    handlers.onStart?.(startProps(true))

    expect(mocks.ReactRenderer).not.toHaveBeenCalled()
    expect(mocks.tippy).not.toHaveBeenCalled()
  })

  test("a skipped start leaves update, key and exit harmless", () => {
    const handlers = newRenderHandlers()
    handlers.onStart?.(startProps(true))

    expect(() => handlers.onUpdate?.(startProps(true))).not.toThrow()
    expect(
      handlers.onKeyDown?.({ event: new KeyboardEvent("keydown") } as never),
    ).toBe(false)
    expect(() => handlers.onExit?.(startProps(true))).not.toThrow()
  })
})
