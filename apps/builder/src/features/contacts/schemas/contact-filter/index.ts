import { z } from "zod"
import { selectFilter } from "./select-filter"
import { textFilter } from "./text-filter"

export const contactFilterRequest = z.object({
  contactFilter: z.object({
    operator: z.enum(["and", "or"]),
    conditions: z.array(
      z.discriminatedUnion("field", [
        selectFilter("language"),
        textFilter("fullName"),
        selectFilter("country"),
        selectFilter("continent"),
        selectFilter("gender"),
        selectFilter("subscribed"),
        selectFilter("contactCreatedDate"),
      ]),
    ),
  }),
})
export type ContactFilterRequest = z.infer<typeof contactFilterRequest>
