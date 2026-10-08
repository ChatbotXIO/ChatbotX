import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@chatbotx.io/ui/components/ui/alert"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { InfoIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"

type NoticeAlertProps = {
  tone: "destructive" | "warning" | "default"
  title?: string
  children: ReactNode
  /** Buttons rendered on one row under the message. */
  actions?: ReactNode
  /** Renders an icon-only close button in the top right corner. */
  onDismiss?: () => void
  dismissLabel?: string
  isDismissDisabled?: boolean
  /** `status` for a standing note that needs no interruption; `alert` (default) is announced at once. */
  role?: "alert" | "status"
}

/**
 * The one alert shape this panel uses: leading icon, optional bold title,
 * message, one row of actions and an optional close button.
 */
export const NoticeAlert = ({
  tone,
  title,
  children,
  actions,
  onDismiss,
  dismissLabel,
  isDismissDisabled = false,
  role = "alert",
}: NoticeAlertProps) => {
  const Icon = tone === "default" ? InfoIcon : TriangleAlertIcon
  return (
    <Alert
      className={cn("gap-y-1.5 px-4 py-4", onDismiss && "pe-12")}
      role={role}
      variant={tone}
    >
      <Icon aria-hidden="true" />
      {title ? (
        <AlertTitle className="line-clamp-none">{title}</AlertTitle>
      ) : null}
      <AlertDescription className="col-start-2 gap-2 text-foreground/80!">
        {children}
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </AlertDescription>
      {onDismiss ? (
        <Button
          aria-label={dismissLabel}
          className="absolute end-3 top-3 size-7"
          disabled={isDismissDisabled}
          onClick={onDismiss}
          size="icon"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </Alert>
  )
}
