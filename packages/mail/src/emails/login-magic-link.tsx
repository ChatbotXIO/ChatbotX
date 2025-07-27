import { Button, Heading, Section, Text } from "@react-email/components"
import BaseTempate from "./base-template"

export interface LoginMagicLinkEmailProps {
  // name: string;
  url: string
}

export function LoginMagicLinkEmail({
  // name,
  url,
}: LoginMagicLinkEmailProps) {
  return (
    <BaseTempate>
      <>
        <Heading>Magic link request</Heading>
        <Text>
          Hey! You asked us to send you a magic link for quickly signing into
          your AhachatAI account.
        </Text>
        <Section>
          <Button href={url}>Sign in to AhachatAI</Button>
        </Section>
        <Text>
          The above link is a magic link, only meant for you. Please don't share
          it with anyone.
        </Text>
        <Text>The link will expire in 5 minutes.</Text>
        <Text>
          If you did not request this or if you didn't mean to reset a magic
          link, then you can just ignore this email. Your password will not
          charge.
        </Text>
      </>
    </BaseTempate>
  )
}

LoginMagicLinkEmail.PreviewProps = {
  name: "Whoami",
  url: "https://ahachat.ai",
} as LoginMagicLinkEmailProps

export default LoginMagicLinkEmail
