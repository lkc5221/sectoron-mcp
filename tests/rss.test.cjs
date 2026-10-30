const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function harness() {
	const tools = new Map();
	const transpile = (source) =>
		ts.transpileModule(source, {
			compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
		}).outputText;
	const searchModule = { exports: {} };
	vm.runInNewContext(transpile(fs.readFileSync("src/search.ts", "utf8")), {
		exports: searchModule.exports,
	});
	const item = (id, title, summary, tags, date = "Fri, 30 Oct 2026 00:00:00 GMT") =>
		`<item><title>${title}</title><description><![CDATA[${summary}]]></description><link>https://example.com/${id}</link><guid>https://example.com/?p=${id}</guid><pubDate>${date}</pubDate>${tags.map((tag) => `<category domain="ticker"><![CDATA[${tag}]]></category>`).join("")}</item>`;
	const fixture = `<rss><channel>${[
		item(1, "NVIDIA chip launch", "AI &amp; Chips", ["NVDA", "半導体", "AI &amp; Chips"]),
		item(2, "NVDA text only", "NVDA", ["NVDAX"]),
		item(3, "Google update", "data center investment", ["GOOG"]),
		item(4, "Alphabet earnings", "Cloud", ["GOOGL"]),
		item(5, "Tesla update", "EV", ["TSLA"]),
		item(6, "Security update", "ransomware", []),
		item(7, "Unrelated chipotle", "Other news", []),
		item(8, "No keywords here", "Other", ["サイバーセキュリティ"]),
		item(9, "AMD update", "Other", ["AMD"]),
		item(10, "Apple update", "Other", ["AAPL"]),
		item(11, "Microsoft update", "Other", ["MSFT"]),
		item(12, "Silicon Motion update", "Other", ["SIMO"]),
	].join("")}</channel></rss>`;
	const context = {
		exports: {},
		Error,
		fetch: async (url) => {
			assert.equal(url, "https://sectoron.net/feed/");
			return new Response(fixture, { headers: { "content-type": "application/rss+xml" } });
		},
		require: (name) => {
			if (name === "./search") return searchModule.exports;
			if (name === "zod") return require("zod");
			if (name === "@modelcontextprotocol/server")
				return {
					McpServer: class {
						constructor(info) {
							assert.equal(info.version, "1.2.0");
						}
						registerTool(name, options, callback) {
							tools.set(name, { options, callback });
						}
					},
				};
			if (name === "agents/mcp/server")
				return {
					createMcpHandler: (factory) => {
						factory();
						return () => {};
					},
				};
			throw new Error(`Unexpected import: ${name}`);
		},
	};
	vm.runInNewContext(transpile(fs.readFileSync("src/index.ts", "utf8")), context);
	const call = async (name, args) => {
		const tool = tools.get(name);
		const result = await tool.callback(tool.options.inputSchema.parse(args));
		return { raw: result, data: JSON.parse(result.content[0].text) };
	};
	return { call, context, tools, search: searchModule.exports };
}

test("all configured company aliases and tickers resolve, including Google share classes", async () => {
	const h = harness();
	for (const company of h.search.COMPANIES) {
		for (const alias of [...company.aliases, ...company.tickers]) {
			const { data } = await h.call("search_news_by_company", { company: ` ${alias} ` });
			assert.equal(data.resolved_company, company.name);
			assert.deepEqual(data.tickers, Array.from(company.tickers));
			assert.equal(data.count, company.name === "Alphabet" ? 2 : 1);
			assert.match(data.search_scope, /Recent RSS/);
		}
	}
});

test("ticker compatibility: exact tags, normalized case, limits and no title fallback", async () => {
	const h = harness();
	const { data } = await h.call("search_news_by_ticker", { ticker: " nvda ", limit: 1 });
	assert.equal(data.count, 1);
	assert.equal(data.articles[0].id, 1);
	assert.deepEqual(data.articles[0].tags, ["NVDA", "半導体", "AI & Chips"]);
	assert.equal((await h.call("search_news_by_ticker", { ticker: "NONE" })).data.count, 0);
});

test("theme aliases search titles, summaries and categories without Latin substring false positives", async () => {
	const h = harness();
	for (const sector of h.search.SECTORS)
		for (const alias of sector.aliases) {
			const { data } = await h.call("search_news_by_sector", { sector: alias });
			assert.equal(data.resolved_sector, sector.name);
			assert.equal(data.count, sector.name === "cybersecurity" ? 2 : 1);
		}
	assert.equal(
		(await h.call("search_news_by_sector", { sector: "반도체", limit: 1 })).data.count,
		1,
	);
});

test("unknown company/theme returns explicit empty results without fetching or inventing news", async () => {
	const h = harness();
	h.context.fetch = () => {
		throw new Error("Must not fetch");
	};
	for (const [tool, args] of [
		["search_news_by_company", { company: "Unknown" }],
		["search_news_by_sector", { sector: "Unknown" }],
	]) {
		const { data } = await h.call(tool, args);
		assert.equal(data.count, 0);
		assert.deepEqual(data.articles, []);
		assert.match(data.message, /No matching/);
		assert.match(data.reason, /Unsupported/);
	}
});

test("latest news, RSS diagnostics, sorting and limits remain supported", async () => {
	const h = harness();
	const latest = (await h.call("get_latest_news", { limit: 2 })).data;
	assert.equal(latest.count, 2);
	assert.match(latest.search_scope, /Recent RSS/);
	assert.equal(latest.articles[0].summary, "AI & Chips");
	const connection = (await h.call("test_rss_connection", {})).data;
	assert.equal(connection.ok, true);
	assert.equal(connection.isRSS, true);
	h.context.fetch = async () =>
		new Response(
			"<rss><channel><item><title>Old</title><link>https://example.com/old</link><pubDate>Thu, 29 Oct 2026 00:00:00 GMT</pubDate></item><item><title>New</title><link>https://example.com/new</link><pubDate>Fri, 30 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>",
		);
	assert.equal((await h.call("get_latest_news", { limit: 1 })).data.articles[0].title, "New");
});

test("RSS searches do not silently truncate matching articles beyond 100 items", async () => {
	const h = harness();
	h.context.fetch = async () =>
		new Response(
			`<rss><channel>${Array.from({ length: 101 }, (_, i) => `<item><title>Article ${i}</title><link>https://example.com/${i}</link>${i === 100 ? "<category>NVDA</category>" : ""}</item>`).join("")}</channel></rss>`,
		);
	assert.equal((await h.call("search_news_by_company", { company: "NVIDIA" })).data.count, 1);
	assert.equal((await h.call("search_news_by_ticker", { ticker: "NVDA" })).data.count, 1);
});

test("network and invalid RSS errors remain errors, not empty search results", async () => {
	const h = harness();
	for (const response of [
		() => {
			throw new Error("network failed");
		},
		() => new Response("unavailable", { status: 503 }),
		() => new Response("<html>not RSS</html>"),
	]) {
		h.context.fetch = async () => response();
		for (const [tool, args] of [
			["get_latest_news", {}],
			["search_news_by_ticker", { ticker: "NVDA" }],
			["search_news_by_company", { company: "NVIDIA" }],
			["search_news_by_sector", { sector: "반도체" }],
		]) {
			const result = await h.tools
				.get(tool)
				.callback(h.tools.get(tool).options.inputSchema.parse(args));
			assert.equal(result.isError, true);
		}
	}
	h.context.fetch = async () => {
		throw new Error("network failed");
	};
	assert.equal((await h.tools.get("test_rss_connection").callback({})).isError, true);
});

test("supported searches with no matching RSS articles return empty results", async () => {
	const h = harness();
	h.context.fetch = async () =>
		new Response(
			"<rss><channel><item><title>Unrelated</title><link>https://example.com/unrelated</link></item></channel></rss>",
		);
	for (const [tool, args] of [
		["search_news_by_company", { company: "NVIDIA" }],
		["search_news_by_sector", { sector: "반도체" }],
	]) {
		const { raw, data } = await h.call(tool, args);
		assert.equal(raw.isError, undefined);
		assert.equal(data.count, 0);
		assert.deepEqual(data.articles, []);
		assert.match(data.message, /No matching/);
	}
});

test("tool input schemas reject invalid limits and blank new search inputs", async () => {
	const h = harness();
	await assert.rejects(h.call("search_news_by_company", { company: " ", limit: 1 }));
	await assert.rejects(h.call("search_news_by_sector", { sector: " ", limit: 1 }));
	await assert.rejects(h.call("get_latest_news", { limit: 11 }));
	await assert.rejects(h.call("search_news_by_ticker", { ticker: "NVDA", limit: 0 }));
});
