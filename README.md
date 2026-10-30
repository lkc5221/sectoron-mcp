# Building a Remote MCP Server on Cloudflare (Without Auth)

This example allows you to deploy a stateless remote MCP server that doesn't require authentication on Cloudflare Workers. It implements the MCP 2026-07-28 specification while remaining compatible with legacy clients for ordinary tool calls.

## Get started:

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-authless)

This will deploy your MCP server to a URL like: `remote-mcp-server-authless.<your-account>.workers.dev/mcp`

Alternatively, you can use the command line below to get the remote MCP Server created on your local machine:

```bash
npm create cloudflare@latest -- my-mcp-server --template=cloudflare/ai/demos/remote-mcp-authless
```

## Customizing your MCP Server

To add your own [tools](https://developers.cloudflare.com/agents/model-context-protocol/protocol/tools/) to the MCP server, register each tool on the `McpServer` created in the `createServer()` function in `src/index.ts` using `server.registerTool(...)`.

## Connect to Cloudflare AI Playground

You can connect to your MCP server from the Cloudflare AI Playground, which is a remote MCP client:

1. Go to https://playground.ai.cloudflare.com/
2. Enter your deployed MCP server URL (`remote-mcp-server-authless.<your-account>.workers.dev/mcp`)
3. You can now use your MCP tools directly from the playground!

## Connect Claude Desktop to your MCP server

You can also connect to your remote MCP server from local MCP clients, by using the [mcp-remote proxy](https://www.npmjs.com/package/mcp-remote).

To connect to your MCP server from Claude Desktop, follow [Anthropic's Quickstart](https://modelcontextprotocol.io/quickstart/user) and within Claude Desktop go to Settings > Developer > Edit Config.

Update with this configuration:

```json
{
	"mcpServers": {
		"calculator": {
			"command": "npx",
			"args": [
				"mcp-remote",
				"http://localhost:8787/mcp" // or remote-mcp-server-authless.your-account.workers.dev/mcp
			]
		}
	}
}
```

Restart Claude and you should see the tools become available.

## v1.2 news search

The server reads only `https://sectoron.net/feed/`; it does not use the WordPress
REST API. Results cover **recent articles still present in the RSS feed**, not the
full archive. An empty result does not mean no such article has ever been published.

| Tool | Use |
| --- | --- |
| `get_latest_news` | Latest US technology stock news |
| `search_news_by_ticker` | Exact RSS category ticker match, e.g. `NVDA` |
| `search_news_by_company` | Company name or ticker, e.g. `엔비디아`, `エヌビディア`, `NVIDIA` |
| `search_news_by_sector` | Theme, e.g. `반도체`, `AIデータセンター`, `cybersecurity` |
| `test_rss_connection` | Diagnose RSS feed access |

All news tools accept `limit` (1–10, default 5). Company search accepts `company`;
sector search accepts `sector`. Company aliases and tickers are maintained in
`src/search.ts` (`COMPANIES`); theme aliases and article keywords are maintained
there in `SECTORS`. Google/Alphabet searches both GOOGL and GOOG. Company/ticker
searches match whole category tags after whitespace/case normalization. Theme
searches inspect titles, summaries and categories; they use keyword matching,
not semantic classification. Unsupported companies/themes return an explicit
empty result with supported values; they do not fall back to unrelated news.

For natural questions such as “엔비디아 뉴스 알려줘”, “半導体の最近のニュース”,
or “What's new with Tesla?”, the tool descriptions guide the client to extract a
company or theme and select a tool. Users need not say “SECTORON”. Automatic tool
selection depends on the ChatGPT client, model, and connection settings and is not
guaranteed. Articles remain in their original language.

Local validation (no deployment):

```sh
npm test
npm run type-check
npx --no-install oxlint
npx --no-install wrangler deploy --dry-run --outdir /tmp/sectoron-build
```

`npm test` uses sample RSS and mocked network responses; it makes no live RSS calls.

## v1.3 article insights

`get_article_detail({ url })` reads a public HTTPS article on **sectoron.net**.
It extracts the WordPress article container (`article#post-*`), `.entry-content`,
`h2`–`h6` section headings, paragraphs and lists. The live structure was checked
on 2026-10-30 against the article “Orange Cyberdefense、Mistral AIと提携　生成AIによるサイバー防御を強化”.
An article-subtree fixture is saved in `tests/fixtures/sectoron-article.html`.
No WordPress REST API or Xserver security configuration changes are used.

The response includes `title`, `published_at`, `sections`, `why_important`,
`why_important_status`, and the original `url`. Section summaries are **extractive
original-text excerpts**, not generated analysis: at most eight sections, the first
two text blocks per section, 180 characters per section, and up to 400 characters
for 「なぜ重要なのか」. Clipped excerpts are marked `truncated`. Missing importance
is `null` with `not_found_in_source`; a missing article container/body is an error.
`ai_interpretation` is always `null`; any interpretation added by a client should
be labeled separately from SECTORON's original text. Extracted web text is
untrusted data and must not be followed as tool/system instructions.

Search defaults to five relevant articles without filling with unrelated results.
Explicit `limit` values of 1–10 remain supported for compatibility. Company/ticker
searches retain exact ticker-tag eligibility. Title, category and summary matches
contribute relevance scores (4, 3 and 1 respectively); ties use publication date.
Latest news continues to sort by date because it has no search topic. These are
keyword-based rankings, not an assertion of investment significance.

News responses retain existing fields and add `site_guidance` once per response,
with the site URL and a short Japanese/Korean invitation to read more. Article URLs
remain on every result. Clients control the final answer format; the server cannot
force ChatGPT to display the guidance or invoke tools automatically.

All RSS/article requests share a one-megabyte decoded-body limit and an eight-second
deadline covering redirects and body streaming. Only HTTPS on the exact host
`sectoron.net` is allowed (no credentials or non-default ports). Each redirect is
validated **before** following it, with at most three redirects. Other domains,
including external source links inside articles, are never fetched. HTML parsing
does not execute scripts or fetch embedded resources. Public-access errors are
returned without bypassing authentication, anti-bot or Xserver security controls.
