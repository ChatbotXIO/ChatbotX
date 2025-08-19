import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getWhastappIntegration } from "@/features/integration-whatsapp/queries"

export default async function WhatsappMessageTemplatePage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const whatsappIntegration = await getWhastappIntegration({ chatbotId })
  if (!whatsappIntegration) {
    notFound()
  }

  const auth = whatsappIntegration.auth as WhatsappAuthValue

  return (
    <div className="flex w-full flex-wrap gap-2">
      <Button asChild className="w-1/3">
        <Link
          href={`https://business.facebook.com/wa/manage/insights/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`}
          target="_blank"
        >
          Analytics
        </Link>
      </Button>

      <Button asChild className="w-1/3">
        <Link
          href={`https://business.facebook.com/wa/manage/message-templates/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`}
          target="_blank"
        >
          Template Messages
        </Link>
      </Button>

      <Button asChild className="w-1/3">
        <Link
          href={`https://business.facebook.com/billing_hub/accounts/details/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`}
          target="_blank"
        >
          Payment Methods
        </Link>
      </Button>

      <Button asChild className="w-1/3">
        <Link
          href={`https://business.facebook.com/billing_hub/payment_activity/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`}
          target="_blank"
        >
          Payment History
        </Link>
      </Button>
    </div>
  )
}
