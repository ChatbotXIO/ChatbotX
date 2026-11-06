import type { z } from "zod"
import type { pollListItemResource, pollResource } from "./public"

export type PollResource = z.infer<typeof pollResource>
export type PollListItem = z.infer<typeof pollListItemResource>
