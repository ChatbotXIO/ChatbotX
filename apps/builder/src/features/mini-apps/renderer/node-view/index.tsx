"use client"

import type { MiniAppComponentType } from "@chatbotx.io/mini-app"
import type { ComponentType } from "react"
import {
  ChipsSelectorView,
  ChoiceListView,
  DropdownView,
  OptInView,
} from "./choice-views"
import {
  type NodeView as NodeViewData,
  type NodeViewProps,
  toNodeView,
} from "./context"
import {
  CalendarPickerView,
  DatePickerView,
  FilePickerView,
  TextAreaView,
  TextInputView,
} from "./input-views"
import { CarouselView, ImageView } from "./media-views"
import {
  EmbeddedLinkView,
  FooterView,
  NavigationListView,
} from "./navigation-views"
import {
  RichTextView,
  TextBodyView,
  TextHeadingView,
  TextSubheadingView,
} from "./text-views"

export type { NodeViewMode, NodeViewProps } from "./context"

/** The view of each component; containers (Form, If, Switch) have none. */
const VIEWS: Partial<
  Record<MiniAppComponentType, ComponentType<{ view: NodeViewData }>>
> = {
  TextHeading: TextHeadingView,
  TextSubheading: TextSubheadingView,
  TextBody: TextBodyView,
  TextCaption: TextBodyView,
  RichText: RichTextView,
  TextInput: TextInputView,
  TextArea: TextAreaView,
  Dropdown: DropdownView,
  RadioButtonsGroup: ChoiceListView,
  CheckboxGroup: ChoiceListView,
  ChipsSelector: ChipsSelectorView,
  DatePicker: DatePickerView,
  CalendarPicker: CalendarPickerView,
  OptIn: OptInView,
  PhotoPicker: FilePickerView,
  DocumentPicker: FilePickerView,
  Image: ImageView,
  ImageCarousel: CarouselView,
  EmbeddedLink: EmbeddedLinkView,
  NavigationList: NavigationListView,
  Footer: FooterView,
}

/** One Mini App component, as WhatsApp shows it: a preview in the editor, a live field in the runner. */
export function NodeView(props: NodeViewProps) {
  const View = VIEWS[props.node.type]
  return View ? <View view={toNodeView(props)} /> : null
}
