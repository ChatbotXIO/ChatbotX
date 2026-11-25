import { cn } from "@chatbotx.io/ui/lib/utils"
import { UserRoundIcon } from "lucide-react"

/** A page or login picture from the platform, or a neutral placeholder. */
export const PageAvatar = ({
  avatar,
  className,
}: {
  avatar: string | null
  className?: string
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground",
      className,
    )}
  >
    {avatar ? (
      // biome-ignore lint/performance/noImgElement: external platform avatar
      <img
        alt=""
        className="size-full object-cover"
        height={40}
        loading="lazy"
        src={avatar}
        width={40}
      />
    ) : (
      <UserRoundIcon className="size-1/2" />
    )}
  </span>
)
