// Add aliases and tickers here to extend company-name resolution.
export const COMPANIES = [
	{ name: "NVIDIA", aliases: ["NVIDIA", "엔비디아", "エヌビディア"], tickers: ["NVDA"] },
	{ name: "AMD", aliases: ["AMD", "Advanced Micro Devices"], tickers: ["AMD"] },
	{ name: "Tesla", aliases: ["Tesla", "테슬라", "テスラ"], tickers: ["TSLA"] },
	{
		name: "Alphabet",
		aliases: ["Google", "Alphabet", "구글", "알파벳", "グーグル", "アルファベット"],
		tickers: ["GOOGL", "GOOG"],
	},
	{ name: "Apple", aliases: ["Apple", "애플", "アップル"], tickers: ["AAPL"] },
	{
		name: "Microsoft",
		aliases: ["Microsoft", "마이크로소프트", "マイクロソフト"],
		tickers: ["MSFT"],
	},
	{
		name: "Silicon Motion",
		aliases: ["Silicon Motion", "실리콘 모션", "シリコンモーション"],
		tickers: ["SIMO"],
	},
];

// Theme aliases resolve the user's topic; keywords match RSS titles, summaries and tags.
export const SECTORS = [
	{
		name: "semiconductors",
		aliases: ["semiconductor", "semiconductors", "chips", "반도체", "半導体"],
		keywords: ["semiconductor", "semiconductors", "chip", "chips", "반도체", "半導体"],
	},
	{
		name: "ai_datacenters",
		aliases: [
			"AI data center",
			"AI data centers",
			"AI datacenter",
			"AI datacenters",
			"ai_datacenters",
			"AI 데이터센터",
			"AI 데이터 센터",
			"AIデータセンター",
			"data centers",
			"데이터센터",
			"データセンター",
		],
		keywords: [
			"data center",
			"data centers",
			"datacenter",
			"datacenters",
			"데이터센터",
			"데이터 센터",
			"データセンター",
			"AI infrastructure",
			"AI 인프라",
			"AIインフラ",
		],
	},
	{
		name: "cybersecurity",
		aliases: [
			"cybersecurity",
			"cyber security",
			"사이버보안",
			"사이버 보안",
			"サイバーセキュリティ",
		],
		keywords: [
			"cybersecurity",
			"cyber security",
			"ransomware",
			"사이버보안",
			"사이버 보안",
			"랜섬웨어",
			"サイバーセキュリティ",
			"ランサムウェア",
		],
	},
];

export function normalize(value: string): string {
	return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolveCompany(value: string) {
	const query = normalize(value);
	return COMPANIES.find((company) =>
		[...company.aliases, ...company.tickers].some((alias) => normalize(alias) === query),
	);
}

export function resolveSector(value: string) {
	const query = normalize(value);
	return SECTORS.find(
		(sector) =>
			normalize(sector.name) === query ||
			sector.aliases.some((alias) => normalize(alias) === query),
	);
}

export function matchesTicker(tags: string[], tickers: string[]): boolean {
	return tags.some((tag) => tickers.some((ticker) => normalize(tag) === normalize(ticker)));
}

export function matchesSector(
	article: { title: string; summary: string; tags: string[] },
	keywords: string[],
): boolean {
	const fields = [article.title, article.summary, ...article.tags].map(normalize);
	return keywords.some((keyword) => {
		const escaped = normalize(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		// Latin keywords need boundaries so e.g. "chip" does not match "chipotle".
		const pattern = new RegExp(
			`${/^[a-z0-9]/.test(escaped) ? "(^|[^a-z0-9])" : ""}${escaped}${/[a-z0-9]$/.test(escaped) ? "($|[^a-z0-9])" : ""}`,
			"i",
		);
		return fields.some((field) => pattern.test(field));
	});
}
