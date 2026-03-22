import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"

export default function WhatsappEcommerce({
  urls,
}: {
  urls: { ecommerce: string }
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-6">
      <p className="text-2xl">Sell your products on WhatsApp</p>
      <Button size="sm" variant="secondary">
        <Link href={urls.ecommerce} target="_blank">
          Manage your products
        </Link>
      </Button>
    </div>
  )
}
