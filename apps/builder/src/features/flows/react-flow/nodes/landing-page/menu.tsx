import { StepType } from "@aha.chat/flow-config"
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

export const landingPageEditorMenus = (t: TranslationFn): MenuItem[] => [
  {
    label: t("flows.actions.emailH3"),
    icon: HeadingIcon,
    stepType: StepType.emailH3,
  },
  {
    label: t("flows.actions.emailText"),
    icon: TextAlignStartIcon,
    stepType: StepType.emailText,
  },
  {
    label: t("flows.actions.emailImage"),
    icon: ImageIcon,
    stepType: StepType.emailImage,
  },
  {
    label: t("flows.actions.emailButton"),
    icon: RectangleHorizontalIcon,
    stepType: StepType.emailButton,
  },
  {
    label: t("flows.actions.emailLine"),
    icon: MinusIcon,
    stepType: StepType.emailLine,
  },
  {
    label: t("flows.actions.emailSpacing"),
    icon: MoveVerticalIcon,
    stepType: StepType.emailSpacing,
  },
  {
    label: t("flows.actions.emailCode"),
    icon: CodeIcon,
    stepType: StepType.emailCode,
  },
]
