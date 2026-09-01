import { z } from "zod"

export const workspaceApiTokenPermissions = z.enum(["full", "read_only"])
export type WorkspaceApiTokenPermission = z.infer<
  typeof workspaceApiTokenPermissions
>
