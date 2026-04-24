import { findOrFail, isDatabaseError } from "@chatbotx.io/database/client"
import { userModel } from "@chatbotx.io/database/schema"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSafeActionClient,
  DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action"
import { organizationService } from "@/features/organization/services"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { getDomainFromHeader } from "./domain"
import { ChatbotXException } from "./errors/exception"
import { logger } from "./log"

export const actionClient = createSafeActionClient({
  handleServerError(error) {
    logger.error({ error }, "Error in actionClient")
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
