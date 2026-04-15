import { type AIProvider, aiProviders } from "@chatbotx.io/ai"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  SiClaude,
  SiClaudeHex,
  SiGooglegemini,
  SiGooglegeminiHex,
} from "@icons-pack/react-simple-icons"
import { BotIcon } from "lucide-react"
import { OpenAIIcon, OpenAIIconHex } from "@/icons/openai"

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
    case aiProviders.enum.claude:
      return <SiClaude className={fullClassName} fill={SiClaudeHex} />
    case aiProviders.enum.openai:
      return <OpenAIIcon className={fullClassName} fill={OpenAIIconHex} />
    case aiProviders.enum.gemini:
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
