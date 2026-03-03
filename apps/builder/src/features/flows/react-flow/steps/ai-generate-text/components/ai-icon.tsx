import { type AIProvider, aiProviders } from "@aha.chat/flow-config"
import { cn } from "@aha.chat/ui/lib/utils"
import {
  SiClaude,
  SiClaudeHex,
  SiGooglegemini,
  SiGooglegeminiHex,
} from "@icons-pack/react-simple-icons"
import { OpenAI } from "@lobehub/icons"
import { BotIcon } from "lucide-react"

type AIIconProps = {
  provider: AIProvider
  className?: string
  showLabel?: boolean
  label?: string
}

const AIIconInner = (props: AIIconProps) => {
  const { provider, className } = props
  const fullClassName = cn("size-4", className)

  switch (provider) {
    case aiProviders.claude:
      return <SiClaude className={fullClassName} fill={SiClaudeHex} />
    case aiProviders.openai:
      return <OpenAI className={fullClassName} />
    case aiProviders.gemini:
      return (
        <SiGooglegemini className={fullClassName} fill={SiGooglegeminiHex} />
      )
    default:
      return <BotIcon />
  }
}

export const AIIcon = (props: AIIconProps) => {
  const { showLabel = true, label } = props

  return (
    <div className="flex items-center gap-2">
      <AIIconInner {...props} />
      {showLabel && label && <span className="text-sm">{label}</span>}
    </div>
  )
}
