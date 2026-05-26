import { z } from "zod"

// Schema do getLifecycleCountsAction. Mora em arquivo separado por causa
// do quirk Next 16 standalone — z.object inline em .inputSchema() em
// "use server" file dispara `"use server" file can only export async
// functions`. Documentado em
// memory/reference_next16_standalone_use_server_quirk.md.
export const getLifecycleCountsRequest = z.object({
  teamIds: z.array(z.string()).optional(),
})

export type GetLifecycleCountsRequest = z.infer<
  typeof getLifecycleCountsRequest
>
