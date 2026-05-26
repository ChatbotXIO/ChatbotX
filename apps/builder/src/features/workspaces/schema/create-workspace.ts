import { z } from "zod"

export const createWorkspaceRequest = z.object({
  name: z.string().trim().min(1).max(255),
})
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequest>
