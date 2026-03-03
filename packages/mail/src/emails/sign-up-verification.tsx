import { Button, Link, Section, Text } from "@react-email/components"
import BaseTempate, { type BaseTempateProps } from "./base-template"

export type SignUpVerificationProps = BaseTempateProps & {
  userName: string
  verificationUrl: string
}

function SignUpVerification(props: SignUpVerificationProps) {
  const { userName, verificationUrl } = props

  return (
    <BaseTempate {...props}>
      <Text>Hi {userName},</Text>
      <Text>
        Thanks for signing up! Please verify your email address by clicking the
        button below
      </Text>
      <Section>
        <Button href={verificationUrl}>Verify Email Address</Button>
        <Text className="my-2">
          (or use this fallback link:{" "}
          <Link href={verificationUrl}>{verificationUrl}</Link>)
        </Text>
      </Section>
      <Text>
        This link will expire in 24 hours. If you didn't create an account, you
        can ignore this email.
      </Text>
    </BaseTempate>
  )
}

SignUpVerification.PreviewProps = {
  brandName: "ChatbotX",
  brandLogoUrl: "https://example.com/logo.png",
  subject: "Verify your email",
  verificationUrl: "https://example.com/verification-link",
  userName: "John Doe",
} as SignUpVerificationProps

export default SignUpVerification
