import { z } from "zod"

export const updateNotificationsSchema = z.object({
  notificationTypes: z.object({
    notifyAdmin: z.boolean(),
    newMessageToHuman: z.boolean(),
    newOrder: z.boolean(),
  }),
  notificationChannels: z.object({
    messenger: z.boolean(),
    email: z.boolean(),
    telegram: z.boolean(),
    browser: z.boolean(),
  }),
})

export type UpdateNotificationsRequest = z.infer<
  typeof updateNotificationsSchema
>
