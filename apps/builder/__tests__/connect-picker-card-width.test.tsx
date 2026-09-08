// @vitest-environment node

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  CONNECT_DIALOG_WIDTH_CLASS,
  CONNECT_PICKER_CARD_CLASS,
} from "@/features/channel-connect/components/connect-picker-card"

const SURFACES = [
  "src/app/(no-sidebar)/channels/instagram-facebook/select/page.tsx",
  "src/features/integration-messenger/components/select-account.tsx",
  "src/features/integration-instagram/components/select-accounts.tsx",
  "src/features/integration-whatsapp/components/whatsapp-create.tsx",
]

const read = (relative: string) =>
  readFileSync(join(process.cwd(), relative), "utf8")

/** A breakpoint prefix joined to a template expression — invisible to Tailwind's scanner. */
const INTERPOLATED_BREAKPOINT_CLASS = /`sm:\$\{/
/** A width literal written in the dialog file itself instead of the shared constant. */
const DIALOG_WIDTH_LITERAL = /sm:max-w-/

/**
 * The two connect-surface widths live in one file and must be LITERAL
 * Tailwind classes: an interpolated `sm:${token}` is invisible to Tailwind's
 * scanner and shipped once as a dialog with no max-width at all. The picker
 * is wider than the dialog on purpose (its rows carry two switches).
 */
describe("connect surface widths", () => {
  test("the picker card is a wide cap, not a fixed width, and still fits a phone", () => {
    expect(CONNECT_PICKER_CARD_CLASS).toContain("max-w-2xl")
    // `w-full` is what keeps it usable at 320-375px.
    expect(CONNECT_PICKER_CARD_CLASS).toContain("w-full")
    expect(CONNECT_PICKER_CARD_CLASS).not.toContain("max-w-md")
  })

  test.each(SURFACES)("%s renders its card with the shared class", (file) => {
    const source = read(file)

    expect(source).toContain("CONNECT_PICKER_CARD_CLASS")
    // No channel keeps a width literal of its own.
    expect(source).not.toContain("max-w-md")
  })

  test("the status dialog keeps a regular modal width, gated at sm:", () => {
    const dialog = read(
      "src/features/channel-connect/components/connect-many-dialog.tsx",
    )

    expect(dialog).toContain("CONNECT_DIALOG_WIDTH_CLASS")
    // No width literal in the dialog file itself — only the shared constant.
    expect(dialog).not.toMatch(DIALOG_WIDTH_LITERAL)
    expect(CONNECT_DIALOG_WIDTH_CLASS).toBe("sm:max-w-lg")
  })

  test("both width classes are spelled out verbatim in source so Tailwind emits them", () => {
    const source = read(
      "src/features/channel-connect/components/connect-picker-card.tsx",
    )

    // The scanner needs the full class text; a template literal that joins a
    // breakpoint prefix to a variable would silently produce no CSS.
    expect(source).toContain(`"${CONNECT_DIALOG_WIDTH_CLASS}"`)
    expect(source).toContain(`"${CONNECT_PICKER_CARD_CLASS}"`)
    expect(source).not.toMatch(INTERPOLATED_BREAKPOINT_CLASS)
  })
})
