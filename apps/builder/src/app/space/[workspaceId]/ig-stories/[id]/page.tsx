import { notFound } from "next/navigation"
import { EditIgStoryForm } from "@/features/ig-stories/components/edit-ig-story-form"
import { IgStoryPostsStoreProvider } from "@/features/ig-stories/provider/ig-story-posts-store-context"
import { getIgStory } from "@/features/ig-stories/queries"
import type { IgStoryVariant } from "@/features/ig-stories/schema/action"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function EditIgStoryPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  let igStory: Awaited<ReturnType<typeof getIgStory>>
  try {
    igStory = await getIgStory(workspaceId, id)
  } catch {
    return notFound()
  }

  const variant = igStory.type as IgStoryVariant

  return (
    <IgStoryPostsStoreProvider
      autoInitialize={true}
      variant={variant}
      workspaceId={workspaceId}
    >
      <EditIgStoryForm initialData={igStory} workspaceId={workspaceId} />
    </IgStoryPostsStoreProvider>
  )
}
