"use server"

import { createWebshopLink } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * The merchant's Preview / Get Link for a product's, a vendor's or a
 * category's shop page — the same links `webshop.getLink` returns without a
 * contact.
 */
export const getWebshopLinksAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(
    z.object({
      productId: zodBigintAsString().optional(),
      vendorId: zodBigintAsString().optional(),
      categoryId: zodBigintAsString().optional(),
    }),
  )
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const link = await createWebshopLink({ workspaceId, ...parsedInput })
    return { previewUrl: link.url, buttonUrl: link.buttonUrl }
  })
