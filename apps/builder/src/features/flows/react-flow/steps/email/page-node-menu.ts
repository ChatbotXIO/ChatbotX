import {
  type PageElementSchema,
  pageElementTypes,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils/id"
import {
  CodeIcon,
  HeadingIcon,
  ImageIcon,
  MinusIcon,
  MoveVerticalIcon,
  RectangleHorizontalIcon,
  TextAlignStartIcon,
} from "lucide-react"

export const PAGE_ELEMENTS = [
  {
    labelKey: "fields.heading.label",
    icon: HeadingIcon,
    defaultFn: headingElementDefaultFn,
    stepType: pageElementTypes.enum.heading,
  },
  {
    labelKey: "fields.text.label",
    icon: TextAlignStartIcon,
    defaultFn: textElementDefaultFn,
    stepType: pageElementTypes.enum.text,
  },
  {
    labelKey: "fields.image.label",
    icon: ImageIcon,
    defaultFn: imageElementDefaultFn,
    stepType: pageElementTypes.enum.image,
  },
  {
    labelKey: "fields.button.label",
    icon: RectangleHorizontalIcon,
    defaultFn: buttonElementDefaultFn,
    stepType: pageElementTypes.enum.button,
  },
  {
    labelKey: "fields.line.label",
    icon: MinusIcon,
    defaultFn: lineElementDefaultFn,
    stepType: pageElementTypes.enum.line,
  },
  {
    labelKey: "fields.spacing.label",
    icon: MoveVerticalIcon,
    defaultFn: spacingElementDefaultFn,
    stepType: pageElementTypes.enum.spacing,
  },
  {
    labelKey: "fields.code.label",
    icon: CodeIcon,
    defaultFn: codeElementDefaultFn,
    stepType: pageElementTypes.enum.code,
  },
]

function headingElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.heading,
    text: "",
  }
}

function textElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.text,
    text: "",
  }
}

function imageElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.image,
    mode: "file",
    url: "",
  }
}

function buttonElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    label: "",
    type: pageElementTypes.enum.button,
    buttonType: null,
    beforeStep: null,
    steps: [],
  }
}

function lineElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.line,
  }
}

function spacingElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.spacing,
  }
}

function codeElementDefaultFn(): PageElementSchema {
  return {
    id: createId(),
    type: pageElementTypes.enum.code,
    text: "",
  }
}
