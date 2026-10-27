import type { z } from "zod"
import type { updateItemPublicRequest } from "../schema/public"

/** The fields an inline edit can change on an item (everything but its ids). */
export type ItemPatch = Omit<
  z.input<typeof updateItemPublicRequest>,
  "id" | "itemId"
>
