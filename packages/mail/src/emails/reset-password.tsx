import { Button, Link, Section, Text } from "@react-email/components"
import BaseTempate, { type BaseTempateProps } from "./base-template"

export type ResetPasswordProps = BaseTempateProps & {
  userName: string
  resetPasswordUrl: string
}

function ResetPassword(props: ResetPasswordProps) {
  const { userName, resetPasswordUrl } = props

  return (
    <BaseTempate {...props}>
      <Text>Hi {userName},</Text>
      <Text>
        We received a request to reset the password for your account. Click the
        button below to set a new password:
      </Text>
      <Section>
        <Button href={resetPasswordUrl}>Reset Password</Button>
        <Text className="my-2">
          (or use this fallback link:{" "}
          <Link href={resetPasswordUrl}>{resetPasswordUrl}</Link>)
        </Text>
      </Section>
      <Text>
        This link will expire in 1 hour. If you didn't request a password reset,
        you can safely ignore this email — your password won't be changed.
      </Text>
    </BaseTempate>
  )
}

ResetPassword.PreviewProps = {
  brandName: "ChatbotX",
  brandLogoUrl: "https://example.com/logo.png",
  subject: "Verify your email",
  resetPasswordUrl: "https://example.com/verification-link",
  userName: "John Doe",
} as ResetPasswordProps

export default ResetPassword
