import { notFound, redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { CreateIgStoryForm } from "@/features/ig-stories/components/create-ig-story-form"
import { IgStoryPostsStoreProvider } from "@/features/ig-stories/provider/ig-story-posts-store-context"
import { igStoryVariants } from "@/features/ig-stories/schema/action"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateIgStoryPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { variant: rawVariant } = await props.searchParams
  const { data: variant } = igStoryVariants.safeParse(rawVariant)
  if (!variant) {
    redirect(`/space/${data.workspaceId}/ig-stories`)
  }

  return (
    <IgStoryPostsStoreProvider
      autoInitialize={true}
      variant={variant}
      workspaceId={data.workspaceId}
    >
      <CreateIgStoryForm variant={variant} workspaceId={data.workspaceId} />
    </IgStoryPostsStoreProvider>
  )
}
