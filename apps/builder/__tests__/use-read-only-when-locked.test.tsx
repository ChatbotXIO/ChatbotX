import type { Editor } from "@tiptap/react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { useReadOnlyWhenLocked } from "@/components/tiptap/use-read-only-when-locked"

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)

const fakeEditor = (dom: HTMLElement) => {
  const state = { isEditable: true }
  const editor = {
    isDestroyed: false,
    view: { dom },
    get isEditable() {
      return state.isEditable
    },
    setEditable: vi.fn((editable: boolean) => {
      state.isEditable = editable
    }),
  }
  return editor
}

const Probe = ({ editor }: { editor: Editor }) => {
  useReadOnlyWhenLocked(editor)
  return null
}

let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ""
})

const mount = (editor: ReturnType<typeof fakeEditor>) => {
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() => root?.render(<Probe editor={editor as unknown as Editor} />))
}

const flushObserver = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("useReadOnlyWhenLocked", () => {
  test("applies a lock that arrives after mount without a re-render", async () => {
    const fieldset = document.createElement("fieldset")
    const dom = document.createElement("div")
    fieldset.append(dom)
    document.body.append(fieldset)
    const editor = fakeEditor(dom)

    mount(editor)
    expect(editor.isEditable).toBe(true)

    fieldset.disabled = true
    await flushObserver()

    expect(editor.setEditable).toHaveBeenLastCalledWith(false, false)
    expect(editor.isEditable).toBe(false)
  })

  test("makes the editor editable again when the lock clears", async () => {
    const fieldset = document.createElement("fieldset")
    fieldset.disabled = true
    const dom = document.createElement("div")
    fieldset.append(dom)
    document.body.append(fieldset)
    const editor = fakeEditor(dom)

    mount(editor)
    expect(editor.isEditable).toBe(false)

    fieldset.disabled = false
    await flushObserver()

    expect(editor.isEditable).toBe(true)
  })
})
