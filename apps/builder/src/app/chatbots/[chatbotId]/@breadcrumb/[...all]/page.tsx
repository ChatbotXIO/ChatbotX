import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Fragment, type ReactElement } from "react"

export default async function BreadcrumbSlot(props: {
  params: Promise<{ all: string[] }>
}) {
  const params = await props.params

  const breadcrumbItems: ReactElement[] = []
  let breadcrumbPage: ReactElement = <></>

  for (let i = 2; i < params.all.length; i++) {
    const route = params.all[i]
    const href = `/${params.all.at(0)}/${route}`
    if (i === params.all.length - 1) {
      breadcrumbPage = (
        <BreadcrumbItem>
          <BreadcrumbPage className="capitalize">
            {route?.replaceAll("-", " ")}
          </BreadcrumbPage>
        </BreadcrumbItem>
      )
    } else {
      breadcrumbItems.push(
        <Fragment key={href}>
          <BreadcrumbItem>
            <BreadcrumbLink href={href} className="capitalize">
              {route?.replaceAll("-", " ")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </Fragment>,
      )
    }
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbItems}
        {breadcrumbPage}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
