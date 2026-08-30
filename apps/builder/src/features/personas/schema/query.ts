import { z } from "zod"

export const listMessengerPersonasRequest = z.object({
  workspaceId: z.string(),
})
export type ListMessengerPersonasRequest = z.infer<
  typeof listMessengerPersonasRequest
>

const messengerPersonaOption = z.object({
  id: z.string(),
  name: z.string(),
  pageName: z.string(),
})

export const listMessengerPersonasResponse = z.object({
  data: z.array(messengerPersonaOption),
})
export type ListMessengerPersonasResponse = z.infer<
  typeof listMessengerPersonasResponse
>
