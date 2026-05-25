import { type BaseEmailProps, buildSystemEmail, esc } from "./base-template"
import { SIGNUP_BODY_MJML } from "./default-templates"

export type SignUpVerificationProps = BaseEmailProps & {
  userName: string
  verificationUrl: string
}

export function buildSignUpVerificationMjml(
  props: SignUpVerificationProps,
): string {
  const { userName, verificationUrl } = props
  const body = SIGNUP_BODY_MJML.replace(
    /\{\{userName\}\}/g,
    esc(userName),
  ).replace(/\{\{verificationUrl\}\}/g, esc(verificationUrl))
  return buildSystemEmail(props, body)
}
