import "swagger-ui-react/swagger-ui.css"

import dynamic from "next/dynamic"

const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
  loading: () => <p>Loading Component...</p>,
})

export default async function ApiDocsPage() {
  return (
    <section>
      <SwaggerUI url="/openapi.json" />
    </section>
  )
}
