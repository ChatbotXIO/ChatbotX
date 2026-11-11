import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { ComponentProps } from "react"

export function SignInPrompt({
  callbackUrl,
  label,
  variant,
}: {
  /** Where the visitor lands after signing in: the page they were on. */
  callbackUrl: string
  label: string
  variant?: ComponentProps<typeof Button>["variant"]
}) {
  return (
    <Button
      nativeButton={false}
      render={
        <a
          href={`/auth/sign-in?callbackURL=${encodeURIComponent(callbackUrl)}`}
        >
          {label}
        </a>
      }
      variant={variant}
    />
  )
}
