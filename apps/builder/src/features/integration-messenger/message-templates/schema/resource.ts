import {
  createSelectSchema,
  messengerMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const messengerMessageTemplateResource = createSelectSchema(
  messengerMessageTemplateModel,
  {
    id: z.string(),
  },
)
  .pick({
    id: true,
    name: true,
    language: true,
    category: true,
    status: true,
    components: true,
    parameterFormat: true,
    integrationMessengerId: true,
    rejectionReason: true,
  })
  .extend({
    components: z.any(),
  })
export type MessengerMessageTemplateResource = z.infer<
  typeof messengerMessageTemplateResource
>

export const messengerMessageTemplateWithComponents =
  messengerMessageTemplateResource.extend({
    components: z.any(),
    sourceId: z.string(),
  })
export type MessengerMessageTemplateWithComponents = z.infer<
  typeof messengerMessageTemplateWithComponents
>

export const flowMessengerTemplateResource =
  messengerMessageTemplateResource.extend({
    integrationMessenger: z
      .object({
        id: z.string(),
        inboxId: z.string(),
      })
      .nullish(),
  })
export type FlowMessengerTemplateResource = z.infer<
  typeof flowMessengerTemplateResource
>
