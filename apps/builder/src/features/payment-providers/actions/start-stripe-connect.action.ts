"use server"

import { workspaceService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  createStripeConnectLink,
  stripeIntegrationPath,
} from "../lib/stripe-connect"

/**
 * The Stripe Connect page for this workspace — the same link
 * `paymentProviders.getStripeConnectLink` returns; the callback lands back on
 * the Stripe row of the host the member is on.
 */
export const startStripeConnectAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ ctx: { user }, bindArgsParsedInputs: [workspaceId] }) => {
    await assertWorkspaceSuperAdmin(workspaceId)
    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      throw notFoundException("Workspace does not exist.")
    }
    const returnTo = new URL(
      stripeIntegrationPath(workspaceId),
      await getOriginUrlFromHeader(),
    ).toString()
    const { url } = await createStripeConnectLink({
      workspace,
      userId: user.id,
      returnTo,
      email: user.email,
    })
    return { url }
  })
