"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  invitationModel,
  organizationModel,
  userModel,
} from "@chatbotx.io/database/schema"
import type { WorkspaceModel } from "@chatbotx.io/database/types"

export async function findInvitation({ code }: { code: string }) {
  const invitation = await findOrFail({
    table: invitationModel,
    where: {
      code,
    },
    message: "Invitation not found",
  })
  if (invitation.expiresAt < new Date()) {
    throw new ChatbotXException("Invitation expired")
  }

  const user = await findOrFail({
    table: userModel,
    where: {
      id: invitation.invitedBy,
    },
    message: "User not found",
  })

  let workspace: WorkspaceModel | null = null
  if (invitation.workspaceId) {
    workspace =
      (await db.query.workspaceModel.findFirst({
        where: {
          id: invitation.workspaceId,
        },
      })) ?? null
  }

  const organization = await findOrFail({
    table: organizationModel,
    where: {
      id: invitation.organizationId,
    },
    message: "Organization not found",
  })

  return {
    invitation,
    user,
    workspace,
    organization,
  }
}
