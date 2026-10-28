import {
  ecommerceOpenHoursService,
  flowService,
  paymentProviderService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { CheckoutSettingsForm } from "@/features/ecommerce-settings/components/checkout-settings-form"
import { EcommerceSettingsSidebar } from "@/features/ecommerce-settings/components/ecommerce-settings-sidebar"
import { GeneralSettingsForm } from "@/features/ecommerce-settings/components/general-settings-form"
import { PaymentSettingsForm } from "@/features/ecommerce-settings/components/payment-settings-form"
import { ShippingSettingsForm } from "@/features/ecommerce-settings/components/shipping-settings-form"
import { getEcommerceSettings } from "@/features/ecommerce-settings/lib/get-ecommerce-settings"
import { ecommerceSettingsSections } from "@/features/ecommerce-settings/lib/sections"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function EcommerceSettingsSectionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; section: string }>
}) {
  const { workspaceId, section: rawSection } = await params
  const { data: section } = ecommerceSettingsSections.safeParse(rawSection)
  if (!section) {
    notFound()
  }
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const settings = await getEcommerceSettings(workspaceId)

  return (
    <div className="flex min-h-0 flex-1">
      <EcommerceSettingsSidebar active={section} workspaceId={workspaceId} />
      <div className="min-w-0 max-w-5xl flex-1 space-y-4 p-4">
        {section === "general" ? (
          <GeneralSettingsForm
            flowOptions={
              await flowService.listPublishedOptions({ workspaceId })
            }
            openHours={await ecommerceOpenHoursService.list(workspaceId)}
            settings={settings}
            workspaceId={workspaceId}
          />
        ) : null}
        {section === "payments" ? (
          <PaymentSettingsForm
            connectedProviders={(
              await paymentProviderService.list(workspaceId)
            ).map((connection) => connection.provider)}
            settings={settings}
            workspaceId={workspaceId}
          />
        ) : null}
        {section === "shipping" ? (
          <ShippingSettingsForm settings={settings} workspaceId={workspaceId} />
        ) : null}
        {section === "checkout" ? (
          <CheckoutSettingsForm
            flowOptions={
              await flowService.listPublishedOptions({ workspaceId })
            }
            settings={settings}
            workspaceId={workspaceId}
          />
        ) : null}
      </div>
    </div>
  )
}
