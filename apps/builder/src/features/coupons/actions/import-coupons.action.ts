"use server"

import { couponService } from "@chatbotx.io/business"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ImportCouponRequest,
  type ImportCouponResponse,
  importCouponRequest,
} from "../schemas/mutation"

export const importCouponsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(importCouponRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      ctx: { user: { id: string } }
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: ImportCouponRequest
    }): Promise<ImportCouponResponse> => {
      const row = await couponService.startImport({
        workspaceId,
        userId: user.id,
        fileId: parsedInput.fileId,
        topicId: parsedInput.topicId,
      })

      await defaultQueue.add(
        DefaultJobAction.runImport,
        {
          type: DefaultJobAction.runImport,
          data: { importId: row.id },
        },
        { jobId: `import-coupons-${row.id}` },
      )

      return { importId: row.id }
    },
  )
