import { Button, Link, Section, Text } from "@react-email/components"
import BaseTemplate, { type BaseTemplateProps } from "./base-template"

export type SignInMagicLinkProps = BaseTemplateProps & {
  userName: string
  magicUrl: string
}

function SignInMagicLink(props: SignInMagicLinkProps) {
  const { userName, brandName, magicUrl } = props

  return (
    <BaseTemplate {...props}>
      <Text>Hi {userName},</Text>
      <Text>
        Click the button below to securely sign in to your {brandName} account.
        This link will expire in 15 minutes and can only be used once.
      </Text>
      <Section>
        <Button href={magicUrl}>Sign in to {brandName}</Button>
        <Text className="my-2">
          (or use this fallback link: <Link href={magicUrl}>{magicUrl}</Link>)
        </Text>
      </Section>
      <Text>If you didn't request this, you can safely ignore this email.</Text>
    </BaseTemplate>
  )
}

SignInMagicLink.PreviewProps = {
  brandName: "ChatbotX",
  brandUrl: "https://example.com",
  subject: "Sign in to ChatbotX",
  magicUrl: "https://example.com/magic-link",
  userName: "John Doe",
} as SignInMagicLinkProps

export default SignInMagicLink
