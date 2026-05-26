import { z } from "zod"

// Schema do markFilterReadAction. Mora em arquivo separado pra evitar
// quirk do Next 16 standalone que reclama de schema z.object() inline em
// "use server" files (`A "use server" file can only export async
// functions, found object`).
export const markFilterReadRequest = z.object({
  scope: z.enum(["all", "mine", "unassigned", "team", "lifecycle"]),
  userId: z.string().optional(),
  teamId: z.string().optional(),
  stageId: z.string().optional(),
})

export type MarkFilterReadRequest = z.infer<typeof markFilterReadRequest>
