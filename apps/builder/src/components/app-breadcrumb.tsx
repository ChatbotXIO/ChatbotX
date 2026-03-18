import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@aha.chat/ui/components/ui/breadcrumb"
import { Fragment, type ReactNode } from "react"

export interface BreadcrumbsProps {
  items: Array<{
    label: string
    href?: string
    element?: ReactNode
  }>
}

export const AppBreadcrumb = ({ items }: BreadcrumbsProps) => {
  if (!items?.length) {
    return null
  }

  const renderLink = (item: BreadcrumbsProps["items"][number]) => {
    if (item.element) {
      return item.element
    }
    if (item.href) {
      return <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
    }
    return <BreadcrumbPage>{item.label}</BreadcrumbPage>
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, idx) => {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: safe index
            <Fragment key={`${item.label}-${idx}`}>
              <BreadcrumbItem>{renderLink(item)}</BreadcrumbItem>
              {idx < items.length - 1 && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
