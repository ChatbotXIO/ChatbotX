import z from "zod"
import { workerAPI } from "@/orpc"

export const contactsWorkerAPI = {
  blockContactAPI: workerAPI
    .route({
      method: "POST",
      path: "/contacts/{contactId}/block",
      summary: "Block contact",
      tags: ["Contacts"],
    })
    .input(z.object({ contactId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input }) => {
      return { success: true }
    }),
}
