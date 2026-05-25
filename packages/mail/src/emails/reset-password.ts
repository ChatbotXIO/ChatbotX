import { type BaseEmailProps, buildSystemEmail, esc } from "./base-template"
import { FORGOT_PASSWORD_BODY_MJML } from "./default-templates"

export type ResetPasswordProps = BaseEmailProps & {
  userName: string
  resetPasswordUrl: string
}

export function buildResetPasswordMjml(props: ResetPasswordProps): string {
  const { userName, resetPasswordUrl } = props
  const body = FORGOT_PASSWORD_BODY_MJML.replace(
    /\{\{userName\}\}/g,
    esc(userName),
  ).replace(/\{\{resetPasswordUrl\}\}/g, esc(resetPasswordUrl))
  return buildSystemEmail(props, body)
}
