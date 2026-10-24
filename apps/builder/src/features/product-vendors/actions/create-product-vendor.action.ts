"use server"

import { vendorService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { productVendorFormSchema } from "../schema/action"

export const createProductVendorAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(productVendorFormSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await vendorService.create({ workspaceId, ...parsedInput }),
  )
