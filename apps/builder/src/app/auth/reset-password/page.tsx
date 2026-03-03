import { ResetPassword } from "@/features/auth/reset-password"

type ResetPasswordPageProps = {
  brandName: string
}

export const dynamic = "force-dynamic"

export default function ResetPasswordPage({
  brandName,
}: ResetPasswordPageProps) {
  return <ResetPassword brandName={brandName} />
}
