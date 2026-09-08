import { z } from "zod"
import { contactResource } from "../resource"

export const refreshContactProfilePublicResponse = z.discriminatedUnion(
  "status",
  [
    z.object({ status: z.literal("updated"), contact: contactResource }),
    z.object({
      status: z.literal("skipped"),
      reason: z.enum(["profileComplete", "coolingDown", "channelNotCapable"]),
    }),
    z.object({ status: z.literal("unavailable") }),
    z.object({ status: z.literal("failed") }),
  ],
)
export type RefreshContactProfilePublicResponse = z.infer<
  typeof refreshContactProfilePublicResponse
>
