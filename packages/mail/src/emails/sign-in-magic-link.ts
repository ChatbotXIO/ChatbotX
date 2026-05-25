import { type BaseEmailProps, buildSystemEmail, esc } from "./base-template"
import { MAGIC_LINK_BODY_MJML } from "./default-templates"

export type SignInMagicLinkProps = BaseEmailProps & {
  userName: string
  magicUrl: string
}

export function buildSignInMagicLinkMjml(props: SignInMagicLinkProps): string {
  const { userName, magicUrl, brandName } = props
  const body = MAGIC_LINK_BODY_MJML.replace(/\{\{userName\}\}/g, esc(userName))
    .replace(/\{\{magicUrl\}\}/g, esc(magicUrl))
    .replace(/\{\{brandName\}\}/g, esc(brandName))
  return buildSystemEmail(props, body)
}
