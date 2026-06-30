"use server"

import { tenantHelpItemService } from "@chatbotx.io/business"
import { revalidatePath } from "next/cache"
import { authActionClient } from "@/lib/safe-action"
import { helpItemSchema } from "../schema"
import { helpItemScopeSchema, resolveHelpItemTenantId } from "../scope"

export const createHelpItemAction = authActionClient
  .bindArgsSchemas([helpItemScopeSchema])
  .inputSchema(helpItemSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const tenantId = await resolveHelpItemTenantId(ctx.user, scope)
    const result = await tenantHelpItemService.create(tenantId, parsedInput)
    revalidatePath("/", "layout")
    return result
  })
