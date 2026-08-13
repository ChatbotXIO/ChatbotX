import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  findPhoneNumberDetail,
  type WhatsappPhoneNumberDetail,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import {
  findWaba,
  type WhatsappWabaMMLite,
} from "@chatbotx.io/integration-whatsapp/api/waba"
import { BUSINESS_URL } from "@chatbotx.io/integration-whatsapp/constants"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { WhatsappAccountHealths } from "@/features/integration-whatsapp/components/whatsapp-account-healths"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { WhatsappPhoneVerificationPanel } from "@/features/integration-whatsapp/verification/whatsapp-phone-verification-panel"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { logger } from "@/lib/log"

type WhatsappAccountHealthData = {
  phoneNumber: WhatsappPhoneNumberDetail | null
  waba: WhatsappWabaMMLite
}

async function loadWhatsappAccountHealthData({
  auth,
  integrationId,
}: {
  auth: WhatsappAuthValue
  integrationId: string
}): Promise<WhatsappAccountHealthData> {
  const [phoneNumberResult, wabaResult] = await Promise.allSettled([
    findPhoneNumberDetail(auth),
    findWaba({
      wabaId: auth.metadata.wabaId,
      accessToken: auth.tokens.accessToken,
      fields: "marketing_messages_onboarding_status",
    }),
  ])

  if (phoneNumberResult.status === "rejected") {
    logger.warn(
      { err: phoneNumberResult.reason, integrationId },
      "Unable to load WhatsApp phone number health",
    )
  }

  if (wabaResult.status === "rejected") {
    logger.warn(
      { err: wabaResult.reason, integrationId },
      "Unable to load WhatsApp WABA health",
    )
  }

  return {
    phoneNumber:
      phoneNumberResult.status === "fulfilled" ? phoneNumberResult.value : null,
    waba: wabaResult.status === "fulfilled" ? wabaResult.value : {},
  }
}

export default async function WhatsappAccountHealthsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const integrationWhatsapp = await findIntegrationWhatsapp({
    workspaceId: data.workspaceId,
    id: data.id,
  })

  const auth = integrationWhatsapp.auth as WhatsappAuthValue
  const t = await getTranslations("whatsapp.accountHealths")
  const { phoneNumber, waba } = await loadWhatsappAccountHealthData({
    auth,
    integrationId: integrationWhatsapp.id,
  })
  const businessManagerUrl = `${BUSINESS_URL}/wa/manage/home/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`
  const displayPhoneNumber =
    phoneNumber?.display_phone_number ?? integrationWhatsapp.displayPhoneNumber
  const verifiedName = phoneNumber?.verified_name ?? integrationWhatsapp.name

  return (
    <>
      {integrationWhatsapp.registrationStatus !== "registered" && (
        <WhatsappPhoneVerificationPanel
          displayPhoneNumber={displayPhoneNumber}
          initialCodeRequestedAt={
            integrationWhatsapp.verificationCodeRequestedAt?.toISOString() ??
            null
          }
          integrationId={integrationWhatsapp.id}
          registrationError={integrationWhatsapp.registrationError}
          verifiedName={verifiedName}
          workspaceId={data.workspaceId}
        />
      )}
      {phoneNumber ? (
        <WhatsappAccountHealths
          businessManagerUrl={businessManagerUrl}
          phoneNumber={phoneNumber}
          waba={waba}
          webhookUrl={auth.metadata.webhookUrl}
        />
      ) : (
        <Card className="my-4">
          <CardContent className="flex flex-col gap-2">
            <h2 className="font-medium text-base">{t("unavailable.title")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("unavailable.description")}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
