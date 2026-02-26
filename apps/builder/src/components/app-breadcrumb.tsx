import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@aha.chat/ui/components/ui/breadcrumb"

export interface BreadcrumbsProps {
  items: Array<{
    label: string
    href?: string
    childrenEl?: React.ReactNode
  }>
}

export const AppBreadcrumb = ({ items }: BreadcrumbsProps) => {
  if (!items?.length) {
    return null
  }

  const renderLink = (item: BreadcrumbsProps["items"][number]) => {
    if (item.href) {
      return <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
    }
    if (item.childrenEl) {
      return <BreadcrumbLink asChild>{item.childrenEl}</BreadcrumbLink>
    }
    return <BreadcrumbLink>{item.label}</BreadcrumbLink>
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, idx) => {
          return (
            <>
              {/** biome-ignore lint/suspicious/noArrayIndexKey: wip */}
              <BreadcrumbItem key={item.label + idx}>
                {renderLink(item)}
              </BreadcrumbItem>
              {idx < items.length - 1 && <BreadcrumbSeparator />}
            </>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
