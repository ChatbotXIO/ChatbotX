import ky from "ky"
import type { WhatsappAuthValue } from ".."
import {
  API_URL,
  DEFAULT_API_VERSION,
  DEFAULT_WHATSAPP_VERIFICATION_LANGUAGE,
  type WhatsappVerificationCodeMethod,
} from "../constants"
import { rescue } from "../exception"

const api = ky.create({
  timeout: 60_000,
})

export {
  DEFAULT_WHATSAPP_VERIFICATION_LANGUAGE,
  WHATSAPP_VERIFICATION_CODE_METHODS,
  type WhatsappVerificationCodeMethod,
} from "../constants"

export function requestVerificationCode({
  auth,
  phoneNumberId,
  codeMethod,
  language = DEFAULT_WHATSAPP_VERIFICATION_LANGUAGE,
}: {
  auth: WhatsappAuthValue
  phoneNumberId: string
  codeMethod: WhatsappVerificationCodeMethod
  language?: string
}): Promise<unknown> {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(() =>
    api
      .post(`${API_URL}/${version}/${phoneNumberId}/request_code`, {
        json: {
          code_method: codeMethod,
          language,
        },
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      })
      .json(),
  )
}

export function verifyCode({
  auth,
  phoneNumberId,
  code,
}: {
  auth: WhatsappAuthValue
  phoneNumberId: string
  code: string
}): Promise<unknown> {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(() =>
    api
      .post(`${API_URL}/${version}/${phoneNumberId}/verify_code`, {
        json: {
          code,
        },
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
      })
      .json(),
  )
}
