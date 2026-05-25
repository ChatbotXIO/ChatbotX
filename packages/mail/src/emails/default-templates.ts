import { buildSystemEmail } from "./base-template"

function buildDefaultMjml(subject: string, bodyMjml: string): string {
  return buildSystemEmail(
    {
      brandName: "{{brandName}}",
      brandLogoUrl: "{{brandLogoUrl}}",
      brandUrl: "{{brandUrl}}",
      subject,
    },
    bodyMjml,
  )
}

export const DEFAULT_SIGNUP_SUBJECT = "Verify your email address"

export const SIGNUP_BODY_MJML = `<mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-text padding="0 0 8px 0">Hi {{userName}},</mj-text>
        <mj-text padding="0">
          Thanks for signing up! Please verify your email address by clicking the button below.
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-button href="{{verificationUrl}}" align="left">Verify Email Address</mj-button>
        <mj-text padding="8px 0 0 0" font-size="13px" color="#888888">
          Or use this link: <a href="{{verificationUrl}}" style="color:#3b82f6">{{verificationUrl}}</a>
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-text padding="0" font-size="14px" color="#888888">
          This link will expire in 24 hours. If you didn't create an account, you can ignore this email.
        </mj-text>
      </mj-column>
    </mj-section>`

export const DEFAULT_SIGNUP_TEMPLATE = buildDefaultMjml(
  DEFAULT_SIGNUP_SUBJECT,
  SIGNUP_BODY_MJML,
)

export const DEFAULT_FORGOT_PASSWORD_SUBJECT = "Reset your password"

export const FORGOT_PASSWORD_BODY_MJML = `<mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-text padding="0 0 8px 0">Hi {{userName}},</mj-text>
        <mj-text padding="0">
          We received a request to reset the password for your account.
          Click the button below to set a new password.
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-button href="{{resetPasswordUrl}}" align="left">Reset Password</mj-button>
        <mj-text padding="8px 0 0 0" font-size="13px" color="#888888">
          Or use this link: <a href="{{resetPasswordUrl}}" style="color:#3b82f6">{{resetPasswordUrl}}</a>
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-text padding="0" font-size="14px" color="#888888">
          This link will expire in 1 hour. If you didn't request a password reset,
          you can safely ignore this email — your password won't be changed.
        </mj-text>
      </mj-column>
    </mj-section>`

export const DEFAULT_FORGOT_PASSWORD_TEMPLATE = buildDefaultMjml(
  DEFAULT_FORGOT_PASSWORD_SUBJECT,
  FORGOT_PASSWORD_BODY_MJML,
)

export const DEFAULT_MAGIC_LINK_SUBJECT = "Sign in to {{brandName}}"

export const MAGIC_LINK_BODY_MJML = `<mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-text padding="0 0 8px 0">Hi {{userName}},</mj-text>
        <mj-text padding="0">
          Click the button below to securely sign in to your {{brandName}} account.
          This link will expire in 15 minutes and can only be used once.
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-button href="{{magicUrl}}" align="left">Sign in to {{brandName}}</mj-button>
        <mj-text padding="8px 0 0 0" font-size="13px" color="#888888">
          Or use this link: <a href="{{magicUrl}}" style="color:#3b82f6">{{magicUrl}}</a>
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-text padding="0" font-size="14px" color="#888888">
          If you didn't request this, you can safely ignore this email.
        </mj-text>
      </mj-column>
    </mj-section>`

export const DEFAULT_MAGIC_LINK_TEMPLATE = buildDefaultMjml(
  DEFAULT_MAGIC_LINK_SUBJECT,
  MAGIC_LINK_BODY_MJML,
)
