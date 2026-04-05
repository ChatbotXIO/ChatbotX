import { stepTypes } from "@chatbotx.io/flow-config"
import {
  CodeIcon,
  HeadingIcon,
  ImageIcon,
  MinusIcon,
  MoveVerticalIcon,
  RectangleHorizontalIcon,
  TextAlignStartIcon,
} from "lucide-react"
import type { MenuItem, TranslationFn } from "../types"

export const sendMailEditorMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: t("flows.actions.emailH3"),
    icon: HeadingIcon,
    stepType: stepTypes.enum.emailH3,
  },
  {
    label: t("flows.actions.emailText"),
    icon: TextAlignStartIcon,
    stepType: stepTypes.enum.emailText,
  },
  {
    label: t("flows.actions.emailImage"),
    icon: ImageIcon,
    stepType: stepTypes.enum.emailImage,
  },
  {
    label: t("flows.actions.emailButton"),
    icon: RectangleHorizontalIcon,
    stepType: stepTypes.enum.emailButton,
  },
  {
    label: t("flows.actions.emailLine"),
    icon: MinusIcon,
    stepType: stepTypes.enum.emailLine,
  },
  {
    label: t("flows.actions.emailSpacing"),
    icon: MoveVerticalIcon,
    stepType: stepTypes.enum.emailSpacing,
  },
  {
    label: t("flows.actions.emailCode"),
    icon: CodeIcon,
    stepType: stepTypes.enum.emailCode,
  },
]
