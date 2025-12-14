import MagicLinkSent from "@/features/auth/components/magic-link-sent"

type MagicLinkSentPageProps = {
  brandName: string
}

export const dynamic = "force-dynamic"

export default function MagicLinkSentPage({
  brandName,
}: MagicLinkSentPageProps) {
  return <MagicLinkSent brandName={brandName} />
}
