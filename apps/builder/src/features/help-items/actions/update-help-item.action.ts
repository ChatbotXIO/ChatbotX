"use server"

import { tenantHelpItemService } from "@chatbotx.io/business"
import { revalidatePath } from "next/cache"
import { authActionClient } from "@/lib/safe-action"
import { helpItemIdSchema, helpItemSchema } from "../schema"
import { helpItemScopeSchema, resolveHelpItemTenantId } from "../scope"

const updateHelpItemSchema = helpItemSchema.and(helpItemIdSchema)

export const updateHelpItemAction = authActionClient
  .bindArgsSchemas([helpItemScopeSchema])
  .inputSchema(updateHelpItemSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const { id, ...data } = parsedInput
    const tenantId = await resolveHelpItemTenantId(ctx.user, scope)
    const result = await tenantHelpItemService.update(id, tenantId, data)
    revalidatePath("/", "layout")
    return result
  })
