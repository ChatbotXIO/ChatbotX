import {
  CREATABLE_CHANNELS,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

/**
 * A channel can only be toggled here if it's actually offered on the create
 * picker (`CREATABLE_CHANNELS`) — `smtp`/`omnichannel` aren't real
 * user-creatable channels, so hiding them would be a no-op that just
 * confuses the admin UI.
 */
export const updatePlatformChannelsSchema = z.object({
  hiddenChannels: z
    .array(channelTypes)
    .refine(
      (channels) =>
        channels.every((channel) => CREATABLE_CHANNELS.includes(channel)),
      { message: "Only creatable channels can be hidden" },
    ),
})

export type UpdatePlatformChannelsSchema = z.infer<
  typeof updatePlatformChannelsSchema
>
