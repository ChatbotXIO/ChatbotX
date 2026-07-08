import { describe, expect, test } from "vitest"
import {
  isEditableTarget,
  isRedoShortcut,
  isUndoShortcut,
} from "../flow-edit-toolbar-keyboard"

describe("flow-edit-toolbar keyboard helpers", () => {
  test("recognizes editable targets", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true)
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true)

    const div = document.createElement("div")
    Object.defineProperty(div, "isContentEditable", { value: true })
    expect(isEditableTarget(div)).toBe(true)

    expect(isEditableTarget(document.createElement("button"))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })

  test("recognizes undo and redo shortcuts", () => {
    expect(
      isUndoShortcut(new KeyboardEvent("keydown", { ctrlKey: true, key: "z" })),
    ).toBe(true)
    expect(
      isRedoShortcut(new KeyboardEvent("keydown", { metaKey: true, key: "y" })),
    ).toBe(true)
    expect(
      isRedoShortcut(
        new KeyboardEvent("keydown", {
          ctrlKey: true,
          key: "Z",
          shiftKey: true,
        }),
      ),
    ).toBe(true)
  })
})
