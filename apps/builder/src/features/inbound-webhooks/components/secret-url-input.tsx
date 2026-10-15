"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ComponentProps, useState } from "react"

type SecretUrlInputProps = Omit<
  ComponentProps<typeof Input>,
  "readOnly" | "type" | "value"
> & { value: string }

const MASK_LENGTH = 24

/** Everything after the last `/` (the secret) replaced by dots; the host and path stay readable. */
const maskSecretUrl = (url: string): string => {
  if (url === "") {
    return url
  }
  const lastSlash = url.lastIndexOf("/")
  return lastSlash === -1
    ? "•".repeat(MASK_LENGTH)
    : `${url.slice(0, lastSlash + 1)}${"•".repeat(MASK_LENGTH)}`
}

/**
 * A read-only field for a URL that embeds a secret (the webhook token). It
 * shows the URL with the secret masked until the person asks to see it, so it
 * is not left on screen during a screen share. It stays a text input on
 * purpose: a password input inside the editor's form would be offered to the
 * browser's and extensions' password managers, which would store the token.
 * The full URL never needs to be shown to be copied (the caller copies it).
 */
export const SecretUrlInput = ({
  value,
  className,
  ...props
}: SecretUrlInputProps) => {
  const t = useTranslations("inboundWebhooks.endpoint")
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        {...props}
        autoComplete="off"
        className={`pe-10 font-mono text-xs ${className ?? ""}`}
        data-1p-ignore
        data-bwignore
        data-lpignore="true"
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        type="text"
        value={isVisible ? value : maskSecretUrl(value)}
      />
      <Button
        aria-label={isVisible ? t("hide") : t("show")}
        className="absolute end-0 top-0 h-full px-3 text-muted-foreground"
        onClick={() => setIsVisible((visible) => !visible)}
        size="icon"
        type="button"
        variant="ghost"
      >
        {isVisible ? (
          <EyeOffIcon aria-hidden className="size-4" />
        ) : (
          <EyeIcon aria-hidden className="size-4" />
        )}
      </Button>
    </div>
  )
}
