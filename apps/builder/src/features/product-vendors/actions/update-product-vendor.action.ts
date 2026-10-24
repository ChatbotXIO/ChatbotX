"use server"

import { vendorService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  productVendorActiveSchema,
  productVendorFormSchema,
} from "../schema/action"

export const updateProductVendorAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(productVendorFormSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, vendorId], parsedInput }) =>
      await vendorService.update({ workspaceId, vendorId, data: parsedInput }),
  )

export const toggleProductVendorActiveAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(productVendorActiveSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, vendorId], parsedInput }) =>
      await vendorService.update({ workspaceId, vendorId, data: parsedInput }),
  )
