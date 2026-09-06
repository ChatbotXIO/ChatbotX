"use server"

import { contactExportService } from "@chatbotx.io/business"
import { getAuditActor } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { resolveContactPermissionScope } from "../permissions"
import {
  type ExportContactsRequest,
  type ExportContactsResponse,
  exportContactsRequest,
} from "../schema/action"

export const exportContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(exportContactsRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ExportContactsRequest
    }): Promise<ExportContactsResponse> => {
      const scope = await resolveContactPermissionScope(workspaceId)
      if (!scope) {
        throw new ChatbotXException(
          "User is not associated with this workspace",
        )
      }

      const actor = getAuditActor()

      return await contactExportService.start({
        workspaceId,
        requestedUserId: user.id,
        canExportEmailAndPhone: scope.canViewEmailAndPhone,
        restrictToAssignedUserId: scope.restrictToAssignedUserId,
        actor: { ipAddress: actor?.ipAddress, userAgent: actor?.userAgent },
        ...parsedInput,
      })
    },
  )
