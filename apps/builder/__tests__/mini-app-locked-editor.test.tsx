// @vitest-environment jsdom

import {
  createStarterDefinition,
  defaultMiniAppText,
} from "@chatbotx.io/mini-app"
import { NextIntlClientProvider } from "next-intl"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  MiniAppEditorProvider,
  useMiniAppEditor,
} from "@/features/mini-apps/editor/editor-context"
import { EditorToolbar } from "@/features/mini-apps/editor/editor-toolbar"
import { InspectorContext } from "@/features/mini-apps/editor/inspector/field-row"
import { BooleanProp } from "@/features/mini-apps/editor/inspector/fields"
import { ScreensBar } from "@/features/mini-apps/editor/screens-bar"
import { useCanvasDnd } from "@/features/mini-apps/editor/use-canvas-dnd"
import {
  LockedContent,
  LockedEditorProvider,
} from "@/features/templates/components/locked-editor"
import messages from "../messages/en.json"

vi.mock("@/features/mini-apps/lib/use-default-text", () => ({
  useDefaultText: () => defaultMiniAppText,
}))

describe("mini app editor on a View-only template copy", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (locked: boolean) => {
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <LockedEditorProvider locked={locked}>
            <MiniAppEditorProvider
              initial={{
                name: "App",
                definition: createStarterDefinition("Welcome"),
              }}
            >
              <EditorToolbar
                isSaving={false}
                issues={[]}
                onPreview={vi.fn()}
                onSave={vi.fn()}
                onViewJson={vi.fn()}
              />
              <ScreensBar />
            </MiniAppEditorProvider>
          </LockedEditorProvider>
        </NextIntlClientProvider>,
      )
    })
  }

  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((el) =>
      (el.textContent ?? "").includes(label),
    ) as HTMLButtonElement

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    // jsdom has no PointerEvent; Base UI's switch builds one on click.
    window.PointerEvent ??= MouseEvent as unknown as typeof PointerEvent
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("keeps Preview, View JSON and screen tabs usable; locks Save and Add screen", () => {
    render(true)
    expect(button(messages.miniApps.editor.preview).disabled).toBe(false)
    expect(button(messages.miniApps.editor.viewJson).disabled).toBe(false)
    expect(button("Welcome").disabled).toBe(false)
    expect(button(messages.actions.save).disabled).toBe(true)
    expect(button(messages.miniApps.editor.addScreen).disabled).toBe(true)
    expect(
      (container.querySelector("input") as HTMLInputElement).disabled,
    ).toBe(true)
  })

  test("leaves a regular mini app fully editable", () => {
    render(false)
    expect(button(messages.actions.save).disabled).toBe(false)
    expect(button(messages.miniApps.editor.addScreen).disabled).toBe(false)
    expect(
      (container.querySelector("input") as HTMLInputElement).disabled,
    ).toBe(false)
  })

  describe("drag and drop", () => {
    let dnd: ReturnType<typeof useCanvasDnd>
    let screenKey = ""
    let childCount: () => number

    function Harness() {
      dnd = useCanvasDnd()
      const screen = useMiniAppEditor((state) => state.definition.screens[0])
      screenKey = screen?.key ?? ""
      childCount = () => screen?.children.length ?? 0
      return null
    }

    const renderHarness = (locked: boolean) => {
      act(() => {
        root.render(
          <NextIntlClientProvider
            locale="en"
            messages={messages}
            timeZone="UTC"
          >
            <LockedEditorProvider locked={locked}>
              <MiniAppEditorProvider
                initial={{
                  name: "App",
                  definition: createStarterDefinition("Welcome"),
                }}
              >
                <Harness />
              </MiniAppEditorProvider>
            </LockedEditorProvider>
          </NextIntlClientProvider>,
        )
      })
    }

    const paletteDrop = () =>
      ({
        active: {
          data: { current: { kind: "palette", type: "TextInput" } },
        },
        over: {
          data: {
            current: {
              kind: "slot",
              address: { screenKey },
              length: childCount(),
            },
          },
          rect: { top: 0, height: 100, left: 0, width: 100 },
        },
        activatorEvent: { clientY: 0 },
        delta: { x: 0, y: 0 },
      }) as unknown as Parameters<
        ReturnType<typeof useCanvasDnd>["dndContextProps"]["onDragEnd"]
      >[0]

    test("a drop on a View-only copy does not add a component", () => {
      renderHarness(true)
      const before = childCount()
      act(() => dnd.dndContextProps.onDragEnd(paletteDrop()))
      expect(childCount()).toBe(before)
    })

    test("a drop on a regular mini app still adds a component", () => {
      renderHarness(false)
      const before = childCount()
      act(() => dnd.dndContextProps.onDragEnd(paletteDrop()))
      expect(childCount()).toBe(before + 1)
    })
  })

  describe("BooleanProp switch", () => {
    const setProp = vi.fn()

    const renderSwitch = (locked: boolean) => {
      act(() => {
        root.render(
          <NextIntlClientProvider
            locale="en"
            messages={messages}
            timeZone="UTC"
          >
            <LockedEditorProvider locked={locked}>
              <LockedContent>
                <InspectorContext.Provider
                  value={{ props: {}, issues: [], setProp }}
                >
                  <BooleanProp propKey="required" />
                </InspectorContext.Provider>
              </LockedContent>
            </LockedEditorProvider>
          </NextIntlClientProvider>,
        )
      })
      return container.querySelector('[role="switch"]') as HTMLElement
    }

    beforeEach(() => setProp.mockClear())

    test("is disabled and ignores clicks on a View-only copy", () => {
      const toggle = renderSwitch(true)
      expect(toggle.hasAttribute("data-disabled")).toBe(true)
      act(() => toggle.click())
      expect(setProp).not.toHaveBeenCalled()
    })

    test("toggles on a regular mini app", () => {
      const toggle = renderSwitch(false)
      expect(toggle.hasAttribute("data-disabled")).toBe(false)
      act(() => toggle.click())
      expect(setProp).toHaveBeenCalledWith("required", true)
    })
  })
})
