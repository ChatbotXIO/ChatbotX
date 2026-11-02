import { workspaceDeletionRecordService } from "@chatbotx.io/business"
import z from "zod"
import { authorizedAPI } from "@/orpc"
import { listMyWorkspaces } from "../lib/list-my-workspaces"
import { workspaceDeletionRecordResource } from "../schema/deletion-record"
import { workspaceResource } from "../schema/resource"

export const workspacesAuthenticatedAPI = {
  listMyWorkspacesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/users/me/workspaces",
      summary: "List workspaces the current user is a member of",
      tags: ["Workspaces"],
    })
    .input(z.object({}))
    .output(z.object({ workspaces: z.array(workspaceResource) }))
    .handler(async ({ context }) => await listMyWorkspaces(context.user.id)),

  listDeletedWorkspacesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/users/me/workspaces/deleted",
      summary: "List the current user's deleted workspace evidence",
      tags: ["Workspaces"],
    })
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        perPage: z.number().int().positive().max(100).default(20),
      }),
    )
    .output(
      z.object({
        data: z.array(workspaceDeletionRecordResource),
        pageCount: z.number().int().nonnegative(),
      }),
    )
    .handler(
      async ({ context, input }) =>
        await workspaceDeletionRecordService.listForOwner({
          ownerId: context.user.id,
          page: input.page,
          perPage: input.perPage,
        }),
    ),
}
