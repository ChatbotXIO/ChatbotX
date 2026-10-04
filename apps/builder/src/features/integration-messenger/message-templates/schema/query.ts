import { messengerTemplateStatusSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { integrationMessengerResource } from "../../schema/resource"
import { messengerMessageTemplateResource } from "./resource"

export const listMessengerMessageTemplatesRequest = z.object({
  workspaceId: zodBigintAsString(),
  inboxId: zodBigintAsString()
    .optional()
    .describe(
      "Restrict to templates of the Messenger Page connected to this inbox. Get it from `inboxes.list`.",
    ),
  integrationMessengerId: zodBigintAsString()
    .optional()
    .describe(
      "Restrict to templates of this Messenger channel. Get it from `messengerChannels.list`.",
    ),
  status: messengerTemplateStatusSchema
    .optional()
    .describe("Restrict to templates with this approval status."),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
  name: z.string().optional(),
})
export type ListMessengerMessageTemplatesRequest = z.infer<
  typeof listMessengerMessageTemplatesRequest
>

export const listMessengerMessageTemplatesResponse = z.array(
  messengerMessageTemplateResource.extend({
    integrationMessenger: integrationMessengerResource,
  }),
)
export type ListMessengerMessageTemplatesResponse = z.infer<
  typeof listMessengerMessageTemplatesResponse
>

export const listMessengerMessageTemplatesSearchParamsCache =
  createSearchParamsCache({
    page: parseAsInteger.withDefault(1),
    perPage: parseAsInteger.withDefault(10),
    name: parseAsString.withDefault(""),
  })
