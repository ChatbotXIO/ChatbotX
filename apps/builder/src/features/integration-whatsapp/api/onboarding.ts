import { platformCredentialService } from "@chatbotx.io/business"
import { listPhoneNumbers as whatsappListPhoneNumbers } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { DEFAULT_API_VERSION } from "@chatbotx.io/integration-whatsapp/constants"
import { z } from "zod"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { authorizedAPI } from "@/orpc"
import { listPhoneNumbersRequest } from "../schema"

const whatsappPhoneNumberSchema = z
  .object({
    id: z.string(),
    display_phone_number: z.string(),
  })
  .passthrough()

export const integrationWhatsappOnboardingAPIs = {
  listPhoneNumbersAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/whatsapp/phone-numbers/list",
      summary: "List WhatsApp phone numbers for a WABA (manual onboarding)",
      tags: ["Integrations"],
    })
    .input(listPhoneNumbersRequest)
    .output(
      z.object({
        data: z.array(whatsappPhoneNumberSchema),
      }),
    )
    .handler(async ({ context, input }) => {
      // Host-derived, not the bare current user: a reseller operator on
      // their white-label domain must read phone numbers with the same app
      // `version` connect.action.ts uses to connect them, or the two
      // disagree on the same WABA.
      const ownerId = await resolvePlatformOwnerId({ userId: context.user.id })
      const credential = await platformCredentialService.resolveForOwner({
        ownerId,
        type: "whatsapp",
      })
      const version = credential?.publicConfig.version ?? DEFAULT_API_VERSION

      const phoneNumbers = await whatsappListPhoneNumbers({
        wabaId: input.wabaId,
        accessToken: input.accessToken,
        version,
      })

      return { data: phoneNumbers.data }
    }),
}
