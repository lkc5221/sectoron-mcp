import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const WORDPRESS_API = "https://sectoron.net/wp-json/wp/v2";

type WordPressPost = {
	id: number;
	date: string;
	link: string;
	title: { rendered: string };
	excerpt: { rendered: string };
};

function cleanText(html: string): string {
	return html
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

function createServer() {
	const server = new McpServer({
		name: "SECTORON News",
		version: "1.0.0",
	});

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
				const url = `${WORDPRESS_API}/posts?per_page=${limit}&orderby=date&order=desc&_fields=id,date,link,title,excerpt`;

				const response = await fetch(url, {
					headers: {
						Accept: "application/json",
					},
				});

				if (!response.ok) {
  const errorBody = await response.text();

  console.error("WordPress API request failed", {
    status: response.status,
    body: errorBody.slice(0, 1000),
  });

  throw new Error(`WordPress API error: ${response.status}`);
}

				const posts = (await response.json()) as WordPressPost[];

				const news = posts.map((post) => ({
					id: post.id,
					title: cleanText(post.title.rendered),
					summary: cleanText(post.excerpt.rendered),
					published_at: post.date,
					url: post.link,
				}));

				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(
								{
									source: "SECTORON",
									website: "https://sectoron.net",
									count: news.length,
									articles: news,
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

	return server;
}

const handler = createMcpHandler(createServer);

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return handler(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
