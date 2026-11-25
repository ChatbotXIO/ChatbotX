import { describe, expect, test } from "vitest"
import { FeedParseError, parseFeed } from "../src/social-post-feed/parse"
import {
  cleanSummary,
  cleanTitle,
  renderFeedText,
  safeLink,
  toPlainText,
  truncateText,
} from "../src/social-post-feed/text"

const SHA256_HEX = /^[0-9a-f]{64}$/

const rss = (items: string) => `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel><title>Blog</title>${items}</channel>
</rss>`

describe("parseFeed", () => {
  test("reads an RSS item with guid, link, date, CDATA title and HTML summary", async () => {
    const items = await parseFeed(
      rss(`<item>
        <title><![CDATA[Hello <b>world</b> & friends]]></title>
        <link>https://example.com/a</link>
        <guid isPermaLink="false">post-1</guid>
        <pubDate>Mon, 02 Jan 2026 10:00:00 GMT</pubDate>
        <description>&lt;p&gt;First&lt;/p&gt;&lt;p&gt;Second&amp;nbsp;line&lt;/p&gt;</description>
      </item>`),
    )

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      image: null,
      itemKey: "post-1",
      link: "https://example.com/a",
      publishedAt: new Date("2026-01-02T10:00:00Z"),
      summary: "First\nSecond line",
      title: "Hello world & friends",
    })
  })

  test("falls back to the link for the key, then to a hash of title and date", async () => {
    const items = await parseFeed(
      rss(`
      <item><title>Linked</title><link>https://example.com/l</link></item>
      <item><title>Bare</title><pubDate>Tue, 03 Feb 2026 08:00:00 GMT</pubDate></item>`),
    )

    const byTitle = Object.fromEntries(items.map((i) => [i.title, i.itemKey]))
    expect(byTitle.Linked).toBe("https://example.com/l")
    expect(byTitle.Bare).toMatch(SHA256_HEX)
  })

  test("reads an Atom entry with alternate link, published date and summary", async () => {
    const items = await parseFeed(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title type="html">Atom &amp;amp; title</title>
          <id>urn:uuid:1</id>
          <link rel="self" href="https://example.com/self"/>
          <link rel="alternate" href="https://example.com/entry"/>
          <published>2026-03-04T05:06:07Z</published>
          <summary>Short</summary>
        </entry>
      </feed>`)

    expect(items[0]).toMatchObject({
      itemKey: "urn:uuid:1",
      link: "https://example.com/entry",
      publishedAt: new Date("2026-03-04T05:06:07Z"),
      summary: "Short",
    })
  })

  test("reads an RSS 1.0 (RDF) item", async () => {
    const items = await parseFeed(`<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <item><title>Old school</title><link>https://example.com/rdf</link>
          <dc:date>2026-01-01T00:00:00Z</dc:date></item>
      </rdf:RDF>`)

    expect(items).toHaveLength(1)
    expect(items[0]?.publishedAt).toEqual(new Date("2026-01-01T00:00:00Z"))
  })

  test("sorts newest first, drops duplicates, items with no title and link, and non-http links", async () => {
    const items = await parseFeed(
      rss(`
      <item><guid>a</guid><title>Old</title><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
      <item><guid>b</guid><title>New</title><pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate></item>
      <item><guid>b</guid><title>Duplicate</title></item>
      <item><guid>c</guid></item>
      <item><guid>d</guid><title>Script</title><link>javascript:alert(1)</link></item>`),
    )

    expect(items.map((i) => i.itemKey)).toEqual(["b", "a", "d"])
    expect(items.find((i) => i.itemKey === "d")?.link).toBeNull()
  })

  test("keeps at most 100 items", async () => {
    const many = Array.from(
      { length: 150 },
      (_, i) => `<item><guid>g${i}</guid><title>T${i}</title></item>`,
    ).join("")

    expect(await parseFeed(rss(many))).toHaveLength(100)
  })

  test("hashes an overlong guid so the key stays bounded", async () => {
    const [item] = await parseFeed(
      rss(`<item><guid>${"x".repeat(2000)}</guid><title>T</title></item>`),
    )

    expect(item?.itemKey).toMatch(SHA256_HEX)
  })

  test("reads a truncated feed as having no items, and refuses a non-feed or empty document", async () => {
    await expect(parseFeed("<rss><channel><item>")).resolves.toEqual([])
    await expect(parseFeed("<html><body>hi</body></html>")).rejects.toThrow(
      FeedParseError,
    )
    await expect(parseFeed("")).rejects.toThrow(FeedParseError)
  })

  test("refuses a document that declares entities (entity bomb)", async () => {
    const bomb = `<?xml version="1.0"?>
      <!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>
      <rss version="2.0"><channel><item><title>&lol2;</title></item></channel></rss>`

    await expect(parseFeed(bomb)).rejects.toThrow(FeedParseError)
  })

  test("refuses a document nested deeper than the limit", async () => {
    const deep = `${"<a>".repeat(60)}x${"</a>".repeat(60)}`

    await expect(
      parseFeed(`<rss><channel>${deep}</channel></rss>`),
    ).rejects.toThrow(FeedParseError)
  })
})

describe("feed text helpers", () => {
  test("toPlainText strips markup, scripts and control characters", () => {
    expect(
      toPlainText(
        '<p>Hi <a href="x">there</a></p><script>alert(1)</script><style>p{}</style><p>&amp; &#169; &lt;b&gt;\u0007</p>',
      ),
    ).toBe("Hi there\n& ©")
  })

  test("truncateText counts characters, not UTF-16 units, and ends with an ellipsis", () => {
    expect(truncateText("😀😀😀😀", 3)).toBe("😀😀…")
    expect(truncateText("short", 10)).toBe("short")
  })

  test("cleanTitle is one bounded line; cleanSummary keeps line breaks", () => {
    expect(cleanTitle("<b>A</b>\n  B")).toBe("A B")
    expect(cleanTitle("x".repeat(400))?.length).toBe(300)
    expect(cleanSummary("<p>a</p><p>b</p>")).toBe("a\nb")
    expect(cleanTitle(null)).toBeNull()
  })

  test("renderFeedText fills the variables as plain text and drops the blank lines it leaves", () => {
    const item = { link: null, summary: "S", title: "T" }

    expect(renderFeedText("{title}\n{link}\n{summary}", item)).toBe("T\n\nS")
    expect(renderFeedText("{title} $& {summary}", item)).toBe("T $& S")
  })

  test("renderFeedText bounds the result", () => {
    const text = renderFeedText("{title}", {
      link: null,
      summary: null,
      title: "y".repeat(6000),
    })

    expect(Array.from(text).length).toBe(5000)
  })

  test("safeLink accepts http(s) only", () => {
    expect(safeLink("https://example.com/a b")).toBe(
      "https://example.com/a%20b",
    )
    expect(safeLink("ftp://example.com")).toBeNull()
    expect(safeLink("not a url")).toBeNull()
    expect(safeLink(null)).toBeNull()
  })
})

describe("parseFeed JSON Feed", () => {
  const json = (version: string, items: unknown[]) =>
    JSON.stringify({ items, title: "Blog", version })

  test("reads a version 1.1 document with every field", async () => {
    const items = await parseFeed(
      json("https://jsonfeed.org/version/1.1", [
        {
          content_html: "<p>Body</p>",
          date_published: "2026-01-02T10:00:00Z",
          id: "a",
          image: "https://example.com/a.jpg",
          summary: "Short",
          title: "First",
          url: "https://example.com/a",
        },
        { content_text: "Only text", id: 2, title: "Second" },
      ]),
    )

    expect(items.map((item) => item.itemKey)).toEqual(["a", "2"])
    expect(items[0]).toMatchObject({
      image: "https://example.com/a.jpg",
      link: "https://example.com/a",
      summary: "Short",
      title: "First",
    })
    expect(items[0]?.publishedAt?.toISOString()).toBe(
      "2026-01-02T10:00:00.000Z",
    )
    expect(items[1]).toMatchObject({ summary: "Only text", title: "Second" })
  })

  test("reads version 1 (the www address) and a banner image", async () => {
    const items = await parseFeed(
      json("https://www.jsonfeed.org/version/1/", [
        { banner_image: "https://example.com/b.png", id: "b", title: "B" },
      ]),
    )

    expect(items[0]?.image).toBe("https://example.com/b.png")
  })

  test("refuses JSON that is not a JSON Feed, and an image that is not http(s)", async () => {
    await expect(parseFeed('{"items":[]}')).rejects.toBeInstanceOf(
      FeedParseError,
    )
    await expect(parseFeed("{not json")).rejects.toBeInstanceOf(FeedParseError)
    const items = await parseFeed(
      json("https://jsonfeed.org/version/1.1", [
        { id: "x", image: "javascript:alert(1)", title: "X" },
      ]),
    )
    expect(items[0]?.image).toBeNull()
  })

  test("takes the picture of an RSS item from an image enclosure or a media thumbnail", async () => {
    const items = await parseFeed(
      rss(`<item><title>A</title><link>https://example.com/a</link>
        <enclosure url="https://example.com/a.jpg" type="image/jpeg" length="1"/></item>
        <item><title>B</title><link>https://example.com/b</link>
        <media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="https://example.com/b.jpg"/></item>
        <item><title>C</title><link>https://example.com/c</link>
        <enclosure url="https://example.com/c.mp3" type="audio/mpeg" length="1"/></item>`),
    )
    const byTitle = Object.fromEntries(items.map((i) => [i.title, i.image]))
    expect(byTitle).toEqual({
      A: "https://example.com/a.jpg",
      B: "https://example.com/b.jpg",
      C: null,
    })
  })
})

describe("parseFeed fields, authors, categories and pictures", () => {
  const FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:media="http://search.yahoo.com/mrss/" xmlns:g="http://base.google.com/ns/1.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
 <channel><title>Shop</title><link>https://shop.test/</link>
  <item>
   <title>Shoe</title><link>https://shop.test/p/1</link><guid>p1</guid>
   <pubDate>Mon, 02 Jan 2026 10:00:00 GMT</pubDate>
   <dc:creator>Lan</dc:creator>
   <category>Food &amp; Drink</category><category>Tin tức</category><category>food &amp; drink</category>
   <g:price>19.99 USD</g:price>
   <enclosure url="https://cdn.test/e.mp3" type="audio/mpeg" length="1"/>
   <media:group><media:content url="https://cdn.test/g.jpg" medium="image"/></media:group>
   <media:thumbnail url="https://cdn.test/t.jpg"/>
   <itunes:image href="https://cdn.test/i.jpg"/>
   <content:encoded><![CDATA[<p>Hi <b>there</b></p><img src="https://t.test/p.gif" width="1" height="1"><img src="/img/inline.png"><script>x()</script>]]></content:encoded>
  </item>
 </channel></rss>`

  test("keeps namespace prefixes and flattens fields deterministically", async () => {
    const [item] = await parseFeed(FEED)

    expect(item?.fields).toMatchObject({
      "dc:creator": "Lan",
      "g:price": "19.99 USD",
      "enclosure@url": "https://cdn.test/e.mp3",
      "enclosure@type": "audio/mpeg",
      "media:group/media:content@url": "https://cdn.test/g.jpg",
      "category[1]": "Tin tức",
      "category[]": ["Food & Drink", "Tin tức", "food & drink"],
      "itunes:image@href": "https://cdn.test/i.jpg",
      guid: "p1",
    })
    expect(item?.fields["content:encoded"]).toBe("Hi there")
    expect(JSON.stringify(item?.fields)).not.toContain("<")
  })

  test("reads author, categories (deduped) and the feed's title and link", async () => {
    const [item] = await parseFeed(FEED)

    expect(item).toMatchObject({
      author: "Lan",
      categories: ["Food & Drink", "Tin tức"],
      feedLink: "https://shop.test/",
      feedTitle: "Shop",
      content: "Hi there",
    })
  })

  test("orders picture candidates: enclosure, media content, thumbnail, itunes, first real <img>", async () => {
    const [item] = await parseFeed(
      FEED.replace(
        '<enclosure url="https://cdn.test/e.mp3" type="audio/mpeg" length="1"/>',
        '<enclosure url="https://cdn.test/e.jpg" type="image/jpeg" length="1"/>',
      ),
    )

    expect(item?.images).toEqual([
      { source: "enclosure", url: "https://cdn.test/e.jpg" },
      { source: "mediaContent", url: "https://cdn.test/g.jpg" },
      { source: "mediaThumbnail", url: "https://cdn.test/t.jpg" },
      { source: "itunesImage", url: "https://cdn.test/i.jpg" },
      { source: "contentImage", url: "https://shop.test/img/inline.png" },
    ])
    expect(item?.image).toBe("https://cdn.test/e.jpg")
  })

  test("a non-image enclosure and tracking pixels are never pictures; javascript: urls are dropped", async () => {
    const [item] = await parseFeed(
      rss(`<item><guid>a</guid><title>T</title><link>https://x.test/a</link>
        <enclosure url="https://x.test/a.mp3" type="audio/mpeg"/>
        <description>&lt;img src="https://x.test/px.gif" width="1" height="1"&gt;&lt;img src="javascript:alert(1)"&gt;</description></item>`),
    )

    expect(item?.images).toEqual([])
  })

  test("reads an Atom entry's author, categories and links", async () => {
    const [item] = await parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom blog</title><link rel="alternate" href="https://a.test/"/>
      <entry><id>1</id><title>T</title><link rel="alternate" href="https://a.test/1"/>
        <author><name>Minh</name></author><category term="Tech"/><category term="Đời sống"/>
        <link rel="enclosure" type="image/png" href="https://a.test/i.png"/>
        <content type="html">&lt;p&gt;Body&lt;/p&gt;</content></entry></feed>`)

    expect(item).toMatchObject({
      author: "Minh",
      categories: ["Tech", "Đời sống"],
      content: "Body",
      feedTitle: "Atom blog",
      image: "https://a.test/i.png",
    })
    expect(item?.fields["author/name"]).toBe("Minh")
  })

  test("reads a JSON Feed item's author, tags, image and custom fields", async () => {
    const [item] = await parseFeed(
      JSON.stringify({
        home_page_url: "https://j.test/",
        items: [
          {
            _shop: { price: "5" },
            authors: [{ name: "Hoa" }],
            banner_image: "https://j.test/b.jpg",
            content_html: "<p>Hello</p>",
            id: "1",
            image: "https://j.test/i.jpg",
            tags: ["a", "b"],
            title: "T",
            url: "https://j.test/1",
          },
        ],
        title: "JSON blog",
        version: "https://jsonfeed.org/version/1.1",
      }),
    )

    expect(item).toMatchObject({
      author: "Hoa",
      categories: ["a", "b"],
      feedTitle: "JSON blog",
      image: "https://j.test/i.jpg",
    })
    expect(item?.fields["_shop/price"]).toBe("5")
    expect(item?.fields["tags[]"]).toEqual(["a", "b"])
  })

  test("caps keys, value length and key length", async () => {
    const many = Array.from({ length: 300 }, (_, i) => `<x${i}>v</x${i}>`).join(
      "",
    )
    const [item] = await parseFeed(
      rss(
        `<item><guid>a</guid><title>T</title><big>${"y".repeat(5000)}</big>${many}</item>`,
      ),
    )

    expect(Object.keys(item?.fields ?? {}).length).toBeLessThanOrEqual(100)
    expect((item?.fields.big as string).length).toBeLessThanOrEqual(2048)
  })
})

describe("parseFeed namespace-prefixed Atom", () => {
  const prefixed = (entries: string) => `<?xml version="1.0"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:title>Prefixed blog</atom:title>
  <atom:link rel="alternate" href="https://p.test/"/>${entries}
</atom:feed>`
  const entry = (n: number) => `<atom:entry>
    <atom:id>urn:entry:${n}</atom:id>
    <atom:title>Entry ${n}</atom:title>
    <atom:link rel="alternate" href="https://p.test/${n}"/>
    <atom:published>2026-01-0${n}T10:00:00Z</atom:published>
    <atom:summary>Summary ${n}</atom:summary>
    <atom:author><atom:name>Writer ${n}</atom:name></atom:author>
  </atom:entry>`

  test("reads a single prefixed entry", async () => {
    const items = await parseFeed(prefixed(entry(1)))

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      author: "Writer 1",
      feedTitle: "Prefixed blog",
      itemKey: "urn:entry:1",
      link: "https://p.test/1",
      publishedAt: new Date("2026-01-01T10:00:00Z"),
      summary: "Summary 1",
      title: "Entry 1",
    })
    expect(items[0]?.fields).toBeDefined()
  })

  test("reads several prefixed entries", async () => {
    const items = await parseFeed(prefixed(entry(1) + entry(2)))

    expect(items.map((item) => item.title).sort()).toEqual([
      "Entry 1",
      "Entry 2",
    ])
    expect(items.map((item) => item.link).sort()).toEqual([
      "https://p.test/1",
      "https://p.test/2",
    ])
  })
})
