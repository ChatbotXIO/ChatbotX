import { z } from "zod"

// Schema separado pra evitar quirk Next 16 standalone — z.object inline
// (mesmo só usado, não exportado) em "use server" file dispara
// `"use server" file can only export async functions`. Memory:
// reference_next16_standalone_use_server_quirk.md.
export const updateContactLifecycleSchema = z.object({
  contactId: z.string(),
  lifecycleStageId: z.string().nullable(),
})

export type UpdateContactLifecycleInput = z.infer<
  typeof updateContactLifecycleSchema
>
