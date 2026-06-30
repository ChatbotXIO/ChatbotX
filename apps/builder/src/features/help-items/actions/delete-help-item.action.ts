"use server"

import { tenantHelpItemService } from "@chatbotx.io/business"
import { revalidatePath } from "next/cache"
import { authActionClient } from "@/lib/safe-action"
import { helpItemIdSchema } from "../schema"
import { helpItemScopeSchema, resolveHelpItemTenantId } from "../scope"

export const deleteHelpItemAction = authActionClient
  .bindArgsSchemas([helpItemScopeSchema])
  .inputSchema(helpItemIdSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const tenantId = await resolveHelpItemTenantId(ctx.user, scope)
    await tenantHelpItemService.remove(parsedInput.id, tenantId)
    revalidatePath("/", "layout")
  })
