"use client"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ConversationCollection } from "@/features/conversations/schemas/get-conversations-schema"
import ky from "ky"
import { FilterIcon, UserPlusIcon } from "lucide-react"
import { type CSSProperties, useCallback } from "react"
import AutoSizer from "react-virtualized-auto-sizer"
import { FixedSizeList } from "react-window"
import InfiniteLoader from "react-window-infinite-loader"
import useSWRInfinite from "swr/infinite"
import { CreateContactDialog } from "../contacts/create-contact-dialog"
import ConversationItem from "./conversation-item"

interface ConversationListProps {
  chatbotId: string
}

export default function ConversationList({ chatbotId }: ConversationListProps) {
  const perPage = 50
  const { data, size, setSize, isValidating } =
    useSWRInfinite<ConversationCollection>(
      (pageIndex, previousPageData) => {
        if (previousPageData && !previousPageData.nextCursor) return null // Reached the end

        const url = `/api/chatbots/${chatbotId}/conversations?perPage=${perPage}`

        return pageIndex === 0
          ? url
          : `${url}&cursor=${previousPageData.nextCursor}`
      },
      (url: string) => ky.get(url).json(),
      {
        revalidateAll: true,
      },
    )

  const isLoadingInitialData = !data && !isValidating
  const isLoadingMore =
    isLoadingInitialData ||
    (size > 0 && data && typeof data[size - 1] === "undefined")
  const isEmpty = data?.[0]?.data?.length === 0
  const isReachingEnd = isEmpty || (data && !data[data.length - 1]?.nextCursor)

  // Flatten the paginated data into a single array
  const flattenedData = data ? data.flatMap((page) => page.data) : []

  // Determine if an item is loaded
  const isItemLoaded = (index: number) =>
    !isLoadingMore && index < flattenedData.length

  // Load more items when needed
  const loadMoreItems = useCallback(() => {
    if (!isLoadingMore && !isReachingEnd) {
      setSize(size + 1)
    }
  }, [isLoadingMore, isReachingEnd, size, setSize])

  // Render each row in the virtualized list
  const Row = ({ index, style }: { index: number; style: CSSProperties }) => {
    if (!isItemLoaded(index)) {
      return (
        <div style={style}>
          <div style={{ padding: "10px", border: "1px solid #ccc" }}>
            Loading...
          </div>
        </div>
      )
    }

    const item = flattenedData[index]
    return item ? (
      <ConversationItem
        conversation={item}
        isActive={false}
        onSelect={(): void => {
          throw new Error("Function not implemented.")
        }} // isActive={item.id === activeConversationId}
        // onSelect={() => setActiveConversationId(item.id)}
      />
    ) : null
  }

  // const [conversations, setConversations] = useState<ConversationResource[]>(data ?? [])
  // // const [cursor, setCursor] = useState<CursorPagination | null>(initCursor)
  // const [loadingMore, setLoadingMore] = useState<boolean>(false)

  // const [activeConversationId, setActiveConversationId] = useQueryState(
  //   "conversationId",
  //   parseAsString.withOptions({
  //     history: "replace",
  //     shallow: false,
  //   }),
  // )

  // const virtuosoRef = useRef<VirtuosoHandle>(null)
  // const foundIndex = conversations.findIndex(
  //   (c) => c.id === activeConversationId,
  // )
  // const [activeConversationIndex] = useState<number>(
  //   foundIndex > -1 ? foundIndex : 0,
  // )

  // const loadMoreConversations = async () => {
  //   if (loadingMore || !cursor) {
  //     return
  //   }

  //   try {
  //     setLoadingMore(true)
  //     const newConversations = await listConversations({
  //       chatbotId,
  //       cursor,
  //     })
  //     setConversations((prev) => [...prev, ...newConversations.data])
  //     setCursor(newConversations.nextCursor)
  //   } catch (err) {
  //     console.log("err", err)
  //   } finally {
  //     setLoadingMore(false)
  //   }
  // }

  // const onNewConversation = () => {}

  // const mockNewMessageEvent = async () => {
  //   const message = generateRandomMessage(chatbotId)
  //   const randomNewConversation = Math.random() < 0.5
  //   if (!randomNewConversation) {
  //     message.conversationId = conversations[
  //       Math.floor(Math.random() * conversations.length)
  //     ]?.id as string
  //   }

  //   await onNewMessage(message)
  // }

  // const onNewMessage = async (message: Message) => {
  //   const index = conversations.findIndex(
  //     (c) => c.id === message.conversationId,
  //   )
  //   if (index > -1) {
  //     const [existingConversation] = conversations.splice(index, 1) as [
  //       ConversationResource,
  //     ]
  //     // existingConversation.latestMessage = message
  //     existingConversation.updatedAt = message.createdAt
  //     // existingConversation.unreadCount++
  //     conversations.unshift(existingConversation)
  //     setConversations([...conversations])
  //     return
  //   }

  //   const newConversation = await findConversation({
  //     chatbotId,
  //     id: message.conversationId,
  //   })
  //   if (!newConversation.data) {
  //     return
  //   }
  //   setConversations([
  //     newConversation.data as ConversationResource,
  //     ...conversations,
  //   ])
  // }

  // useEffect(() => {
  //   virtuosoRef.current?.scrollToIndex({
  //     index: activeConversationIndex,
  //     align: "start",
  //     behavior: "smooth",
  //   })
  // }, [activeConversationIndex])

  return (
    <>
      <div className="flex items-center gap-1 mb-2">
        <Select defaultValue="2" name="liveChatEnabled">
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Human</SelectItem>
            <SelectItem value="0">Bot</SelectItem>
            <SelectItem value="2">All</SelectItem>
          </SelectContent>
        </Select>

        <CreateContactDialog
          chatbotId={chatbotId}
          trigger={
            <Button variant="outline" size="sm" className="px-2">
              <UserPlusIcon />
            </Button>
          }
        />

        <Button variant="outline" size="sm" className="px-2">
          <FilterIcon />
        </Button>
      </div>

      <InfiniteLoader
        itemCount={
          isReachingEnd ? flattenedData.length : flattenedData.length + 1
        } // Add 1 for the loading indicator
        isItemLoaded={isItemLoaded}
        loadMoreItems={loadMoreItems}
      >
        {({ onItemsRendered, ref }) => (
          <AutoSizer>
            {({ height, width }) => (
              <FixedSizeList
                ref={ref}
                onItemsRendered={onItemsRendered}
                height={height}
                itemCount={flattenedData.length}
                itemSize={30}
                width={width}
              >
                {Row}
              </FixedSizeList>
            )}
          </AutoSizer>
        )}
      </InfiniteLoader>

      {isLoadingMore && <div>Loading more...</div>}
      {isReachingEnd && <div>No more data to load.</div>}

      {/* <Virtuoso
        data={conversations}
        ref={virtuosoRef}
        className="flex flex-col gap-2"
        initialItemCount={data.length}
        atBottomStateChange={(atBottom) => atBottom && loadMoreConversations()}
        itemContent={(_, item) => (
          <Suspense fallback={<ConversationLoading />}>
            <ConversationItem
              conversation={item}
              isActive={item.id === activeConversationId}
              onSelect={() => setActiveConversationId(item.id)}
            />
          </Suspense>
        )}
      /> */}
    </>
  )
}
