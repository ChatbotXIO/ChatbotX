"use server"

import { leaderboardService } from "@chatbotx.io/business/leaderboard"
import { uploader } from "@chatbotx.io/filesystem"
import {
  workspaceIdAndIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { resolveContactPermissionScope } from "@/features/contacts/permissions"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { getLeaderboardExportRequest } from "../lib/action-schemas"

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60

// Exports stay available after trial expiry: reading your own data out is allowed.
export const exportLeaderboardAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], ctx }) => {
    // Phone/email columns follow the member's contact permission.
    const scope = await resolveContactPermissionScope(workspaceId)
    return await leaderboardService.createExport({
      workspaceId,
      id,
      userId: ctx.user.id,
      includeContactInfo: scope?.canViewEmailAndPhone === true,
    })
  })

/** Export progress; `downloadUrl` is a short-lived presigned URL once uploaded. */
export const getLeaderboardExportAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(getLeaderboardExportRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const file = await leaderboardService.getExport({
      workspaceId,
      fileId: parsedInput.fileId,
    })
    return {
      status: file.status,
      fileName: file.fileName,
      totalRecords: file.totalRecords,
      downloadUrl:
        file.status === "uploaded"
          ? await uploader.getPresignedDownload(
              file.path,
              DOWNLOAD_URL_TTL_SECONDS,
            )
          : null,
    }
  })
