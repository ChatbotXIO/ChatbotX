import MagicLinkSent from "@/features/auth/components/magic-link-sent"

export type MagicLinkSentPageProps = {
  brandName: string
}

export default function MagicLinkSentPage({
  brandName,
}: MagicLinkSentPageProps) {
  return <MagicLinkSent brandName={brandName} />
}
