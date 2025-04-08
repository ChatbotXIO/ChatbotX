import { Button } from "@/components/ui/button"
import { getWhastappIntegration } from "@/features/integration-whatsapp/queries"
import type { WhatsappAuthValue } from "@ahachat.ai/integration-whatsapp"
import Link from "next/link"
import { notFound } from "next/navigation"

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
    <div className="flex gap-2 w-full flex-wrap">
      <Button className="w-1/3" asChild>
        <Link
          target="_blank"
          href={`https://business.facebook.com/wa/manage/insights/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`}
        >
          Analytics
        </Link>
      </Button>

      <Button className="w-1/3" asChild>
        <Link
          target="_blank"
          href={`https://business.facebook.com/wa/manage/message-templates/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`}
        >
          Template Messages
        </Link>
      </Button>

      <Button className="w-1/3" asChild>
        <Link
          target="_blank"
          href={`https://business.facebook.com/billing_hub/accounts/details/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`}
        >
          Payment Methods
        </Link>
      </Button>

      <Button className="w-1/3" asChild>
        <Link
          target="_blank"
          href={`https://business.facebook.com/billing_hub/payment_activity/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`}
        >
          Payment History
        </Link>
      </Button>
    </div>
  )
}
