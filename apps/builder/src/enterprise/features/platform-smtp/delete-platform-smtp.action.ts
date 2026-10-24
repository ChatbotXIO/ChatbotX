"use server"

import {
  assertEnterpriseFeatures,
  platformCredentialService,
} from "@chatbotx.io/business"
import { superAdminActionClient } from "@/lib/safe-action"

export const deletePlatformSmtpAction = superAdminActionClient.action(
  async () => {
    await assertEnterpriseFeatures()
    await platformCredentialService.removePlatform({ type: "smtp" })
  },
)
