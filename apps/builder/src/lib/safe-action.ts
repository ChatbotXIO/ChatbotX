import { organizationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { findOrFail, isDatabaseError } from "@chatbotx.io/database/client"
import { organizationMemberRoles } from "@chatbotx.io/database/partials"
import { userModel } from "@chatbotx.io/database/schema"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action"
import { organizationMemberService } from "@/features/organization-members/services"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { getDomainFromHeader } from "./domain"
import { logger } from "./log"

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    logger.error(error, "Error in actionClient")

    if (isDatabaseError(error)) {
      logger.error(error)
      return DEFAULT_SERVER_ERROR_MESSAGE
    }

    if (error instanceof ChatbotXException || error instanceof SdkException) {
      return error.message
    }

    return DEFAULT_SERVER_ERROR_MESSAGE
  },
})

export const authActionClient = actionClient.use(async ({ next }) => {
  const id = await getCurrentUserId()

  const user = await findOrFail({
    table: userModel,
    where: {
      id,
    },
  })

  return next({ ctx: { user } })
})

export const workspaceActionClient = authActionClient.use(
  async ({ bindArgsClientInputs, ctx, next }) => {
    const { user } = ctx

    const { data: workspaceId } = zodBigintAsString().safeParse(
      bindArgsClientInputs[0],
    )
    if (!workspaceId) {
      throw new Error("Workspace not found")
    }

    const { workspaces } = await getAllWorkspaceMembers(user.id)
    const workspace = workspaces.find((c) => c.id === workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    return next({ ctx: { workspaceId: workspace.id, workspace } })
  },
)

export const organizationActionClient = authActionClient.use(
  async ({ next }) => {
    const domain = await getDomainFromHeader()
    const organization = await organizationService.findByDomain(domain)

    return next({ ctx: { organization } })
  },
)

export const orgAdminActionClient = authActionClient.use(
  async ({ ctx, next }) => {
    const domain = await getDomainFromHeader()
    const organization = await organizationService.findByDomain(domain)

    const member = await organizationMemberService.findBy({
      where: { organizationId: organization.id, userId: ctx.user.id },
    })

    if (
      !member ||
      (member.role !== organizationMemberRoles.enum.admin &&
        member.role !== organizationMemberRoles.enum.owner)
    ) {
      throw new ChatbotXException(
        "You do not have permission to manage organization settings.",
      )
    }

    return next({ ctx: { organization } })
  },
)
