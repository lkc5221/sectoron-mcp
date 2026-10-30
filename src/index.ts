import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const WEBSITE = "https://sectoron.net";
const RSS_URL = `${WEBSITE}/feed/`;

type NewsArticle = {
	id: number;
	title: string;
	summary: string;
	published_at: string;
	url: string;
};

function decodeEntities(text: string): string {
	return text
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
			String.fromCodePoint(parseInt(hex, 16)),
		)
		.replace(/&#([0-9]+);/g, (_, num) =>
			String.fromCodePoint(parseInt(num, 10)),
		)
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&apos;/gi, "'")
		.replace(/&#039;/gi, "'");
}

function cleanText(text: string): string {
	return decodeEntities(
		text
			.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
			.replace(/<[^>]*>/g, " ")
	)
		.replace(/\s+/g, " ")
		.trim();
}

function extractTag(xml: string, tag: string): string {
	const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	const regex = new RegExp(
		`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`,
		"i",
	);

	const match = xml.match(regex);

	return match ? match[1].trim() : "";
}

function extractPostId(url: string, guid: string): number {
	const guidMatch = guid.match(/[?&]p=(\d+)/);

	if (guidMatch) {
		return Number(guidMatch[1]);
	}

	const urlMatch = url.match(/[?&]p=(\d+)/);

	if (urlMatch) {
		return Number(urlMatch[1]);
	}

	return 0;
}

async function fetchRSS(): Promise<string> {
	const response = await fetch(RSS_URL, {
		headers: {
			Accept: "application/rss+xml, application/xml, text/xml",
		},
	});

	if (!response.ok) {
		throw new Error(`RSS HTTP error: ${response.status}`);
	}

	const xml = await response.text();

	if (!/<rss\b/i.test(xml)) {
		throw new Error("Invalid RSS response");
	}

	return xml;
}

function parseRSS(xml: string, limit: number): NewsArticle[] {
	const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];

	const articles = items.map((item) => {
		const title = cleanText(extractTag(item, "title"));
		const summary = cleanText(
    extractTag(item, "description")
).replace(
    /投稿\s+.*?\s+は\s+.*?\s+に最初に表示されました。/g,
    ""
).trim();

		const url = cleanText(extractTag(item, "link"));
		const guid = cleanText(extractTag(item, "guid"));

		const pubDate = cleanText(extractTag(item, "pubDate"));

		const date = new Date(pubDate);

		return {
			id: extractPostId(url, guid),
			title,
			summary,
			published_at: Number.isNaN(date.getTime())
				? pubDate
				: date.toISOString(),
			url,
		};
	});

	return articles
		.filter((article) => article.title && article.url)
		.sort((a, b) => {
			const dateA = Date.parse(a.published_at);
			const dateB = Date.parse(b.published_at);

			return (Number.isNaN(dateB) ? 0 : dateB) -
				(Number.isNaN(dateA) ? 0 : dateA);
		})
		.slice(0, limit);
}

function createServer() {
	const server = new McpServer({
		name: "SECTORON News",
		version: "1.1.0",
	});

	// 최신 뉴스 조회
	server.registerTool(
		"get_latest_news",
		{
			description:
				"Get the latest Japanese-language US technology investment news published by SECTORON.",
			inputSchema: z.object({
				limit: z.number().int().min(1).max(10).default(5),
			}),
		},
		async ({ limit }) => {
			try {
				const xml = await fetchRSS();
				const articles = parseRSS(xml, limit);

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(
								{
									source: "SECTORON",
									website: WEBSITE,
									count: articles.length,
									articles,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text:
								error instanceof Error
									? error.message
									: "Failed to fetch SECTORON news.",
						},
					],
				};
			}
		},
	);

	// RSS 연결 테스트
	server.registerTool(
		"test_rss_connection",
		{
			description: "Test SECTORON RSS feed accessibility.",
			inputSchema: z.object({}),
		},
		async () => {
			try {
				const response = await fetch(RSS_URL, {
					headers: {
						Accept: "application/rss+xml, application/xml, text/xml",
					},
				});

				const body = await response.text();

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(
								{
									status: response.status,
									ok: response.ok,
									contentType: response.headers.get("content-type"),
									isRSS: /<rss\b/i.test(body),
									preview: body.slice(0, 200),
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text" as const,
							text:
								error instanceof Error
									? error.message
									: "RSS connection failed",
						},
					],
				};
			}
		},
	);

	return server;
}

const handler = createMcpHandler(createServer);

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
