"use server"

import { couponService } from "@chatbotx.io/business"
import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ExportCouponRequest,
  type ExportCouponResponse,
  exportCouponRequest,
} from "../schemas/mutation"

export const exportCouponsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(exportCouponRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      ctx: { user: { id: string } }
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ExportCouponRequest
    }): Promise<ExportCouponResponse> => {
      const exportId = createId()
      const fileName = `coupons-${new Date().toISOString().slice(0, 10)}.csv`
      const outputPath = `workspaces/${workspaceId}/exports/coupons/coupon_${exportId}.csv`
      const file = await couponService.createExportFile({
        workspaceId,
        userId: user.id,
        fileName,
        path: outputPath,
      })

      await defaultQueue.add(
        DefaultJobAction.exportCoupons,
        {
          type: DefaultJobAction.exportCoupons,
          data: {
            workspaceId,
            requestedUserId: user.id,
            fileId: file.id,
            outputPath,
            outputFormat: "csv",
            filter: {
              topicId: parsedInput.topicId ?? undefined,
              issueStatus: parsedInput.issueStatus ?? undefined,
              usageStatus: parsedInput.usageStatus ?? undefined,
              search: parsedInput.search ?? undefined,
            },
          },
        },
        { jobId: `export-coupons-${workspaceId}-${user.id}-${file.id}` },
      )

      return { fileId: file.id }
    },
  )
