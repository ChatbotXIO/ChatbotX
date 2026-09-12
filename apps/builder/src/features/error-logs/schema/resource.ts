import { createSelectSchema, errorLogModel } from "@chatbotx.io/database/schema"
import z from "zod"

/**
 * The full row, withheld columns included — the base the response schemas are
 * carved out of (`.omit()` for the internal one, `.pick()` for the public one),
 * never something to hand to a component.
 *
 * Deliberately exports no inferred type: the UI-facing shape is
 * `ErrorLogResource` on `./index`, which drops the withheld columns and adds
 * the joined contact. A second type by that name here would compile at every
 * call site and render `undefined` at exactly the columns the projection
 * removes.
 */
export const errorLogResource = createSelectSchema(errorLogModel, {
  id: z.string(),
  workspaceId: z.string(),
  contactId: z.string().nullable(),
})
