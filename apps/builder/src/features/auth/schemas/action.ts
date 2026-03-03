import { z } from "zod"

export const magicLinkRequest = z.object({
  email: z.email(),
})
export type MagicLinkRequest = z.infer<typeof magicLinkRequest>

export const emailPasswordSignInRequest = z.object({
  email: z.email(),
  password: z.string().min(8),
})
export type EmailPasswordSignInRequest = z.infer<
  typeof emailPasswordSignInRequest
>

export const emailPasswordSignUpRequest = z
  .object({
    name: z.string().min(1).max(255),
    email: z.email(),
    password: z.string().min(8).max(100),
    passwordConfirmation: z.string().min(8).max(100),
  })
  .refine(
    (data) => data.password && data.password === data.passwordConfirmation,
    {
      message: "Passwords do not match",
      path: ["passwordConfirmation"],
    },
  )
export type EmailPasswordSignUpRequest = z.infer<
  typeof emailPasswordSignUpRequest
>

export const forgotPasswordRequest = z.object({
  email: z.email(),
})
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequest>

export const resetPasswordRequest = z
  .object({
    token: z.string(),
    newPassword: z.string().min(8).max(100),
    passwordConfirmation: z.string().min(8).max(100),
  })
  .refine(
    (data) =>
      data.newPassword && data.newPassword === data.passwordConfirmation,
    {
      message: "Passwords do not match",
      path: ["passwordConfirmation"],
    },
  )
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequest>
