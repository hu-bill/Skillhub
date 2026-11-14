import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { StringEnum } from "@earendil-works/pi-ai";
import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

const EXTENSION_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(EXTENSION_DIR, "..");
const CLI_PATH = path.join(PACKAGE_ROOT, "bin", "wayfinder");
const CARDS_DIR = path.join(PACKAGE_ROOT, "skills", "route", "cards");
const ROUTE_SKILL_PATH = path.join(PACKAGE_ROOT, "skills", "route", "SKILL.md");

interface WayfinderInfoData {
	title: string;
	body: string;
	timestamp: number;
}

function defaultDataDir(): string {
	const explicit = process.env.PI_WAYFINDER_DATA?.trim();
	if (explicit) return explicit;
	const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), ".pi", "agent");
	return path.join(agentDir, "data", "wayfinder");
}

async function runWayfinderCli(args: string[], timeoutMs = 30_000): Promise<string> {
	try {
		const { stdout, stderr } = await execFileAsync("python3", [CLI_PATH, ...args], {
			timeout: timeoutMs,
			maxBuffer: 1024 * 1024,
			env: process.env,
		});
		const out = stdout.trim();
		return out || stderr.trim() || "(no output)";
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return `wayfinder error: ${message}`;
	}
}

function readCardsStatus(): string {
	const indexPath = path.join(CARDS_DIR, "INDEX.md");
	if (!fs.existsSync(indexPath)) {
		return "No INDEX.md found in cards directory.";
	}
	const today = new Date().toISOString().slice(0, 10);
	const rows = fs
		.readFileSync(indexPath, "utf-8")
		.split("\n")
		.filter((line) => line.startsWith("| ") && !line.startsWith("| id ") && !line.startsWith("| :-"));

	if (rows.length === 0) return "No decision cards indexed.";

	const lines = [
		`${"id".padEnd(28)} ${"verdict".padEnd(16)} ${"expires".padEnd(12)} state`,
	];
	for (const row of rows) {
		const cols = row.split("|").map((c) => c.trim());
		// cols: ["", id, kind, when, verdict, expires, ""]
		const id = cols[1] || "";
		const verdict = cols[4] || "";
		const expires = cols[5] || "";
		const daysLeft = Math.floor((Date.parse(expires) - Date.parse(today)) / 86_400_000);
		const state = Number.isNaN(daysLeft)
			? "unknown"
			: daysLeft < 0
				? "stale"
				: daysLeft <= 14
					? "expiring"
					: "fresh";
		lines.push(`${id.padEnd(28)} ${verdict.padEnd(16)} ${expires.padEnd(12)} ${state}`);
	}
	return lines.join("\n");
}

function isRouteSkillRead(targetPath: string, cwd: string): boolean {
	const cleaned = targetPath.startsWith("@") ? targetPath.slice(1) : targetPath;
	const resolved = path.isAbsolute(cleaned) ? path.normalize(cleaned) : path.resolve(cwd, cleaned);
	return (
		resolved === ROUTE_SKILL_PATH ||
		resolved.endsWith(path.join("skills", "route", "SKILL.md"))
	);
}

export default function (pi: ExtensionAPI) {
	// Prevent recursion inside isolated child `wayfinder scout` subprocesses.
	if (process.env.PI_WAYFINDER_SCOUT === "1") {
		return;
	}

	let autoTriggerMuted = false;

	pi.registerFlag("no-wayfinder", {
		type: "boolean",
		description: "Disable automatic Wayfinder route skill reads for this session (/skill:route still works)",
		default: false,
	});

	pi.on("session_start", async () => {
		if (pi.getFlag("no-wayfinder") === true) {
			autoTriggerMuted = true;
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!autoTriggerMuted) return;
		if (isToolCallEventType("read", event) && isRouteSkillRead(event.input.path, ctx.cwd)) {
			return {
				block: true,
				reason:
					"Wayfinder auto-trigger is disabled for this session (/wayfinder on to re-enable; explicit /skill:route still works).",
			};
		}
	});

	pi.registerEntryRenderer<WayfinderInfoData>("wayfinder-info", (entry, _options, theme) => {
		const data = entry.data ?? { title: "Wayfinder", body: "", timestamp: Date.now() };
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		box.addChild(new Text(`${theme.fg("accent", `[wayfinder: ${data.title}]`)}\n${data.body}`, 0, 0));
		return box;
	});

	const showInfo = (title: string, body: string, hasUI: boolean) => {
		if (hasUI) {
			pi.appendEntry<WayfinderInfoData>("wayfinder-info", {
				title,
				body,
				timestamp: Date.now(),
			});
		} else {
			process.stdout.write(`[wayfinder: ${title}]\n${body}\n`);
		}
	};

	const subcommands = ["status", "ledger", "misses", "route", "off", "on"] as const;

	pi.registerCommand("wayfinder", {
		description: "Inspect Wayfinder cards/ledger, run a route check, or toggle session auto-trigger",
		getArgumentCompletions: (prefix) => {
			const trimmed = prefix.trimStart();
			if (trimmed.includes(" ")) return null;
			const matches = subcommands
				.filter((cmd) => cmd.startsWith(trimmed))
				.map((cmd) => ({ value: cmd, label: cmd }));
			return matches.length > 0 ? matches : null;
		},
		handler: async (rawArgs, ctx) => {
			const trimmed = rawArgs.trim();
			const spaceIndex = trimmed.indexOf(" ");
			const sub = (spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)) || "status";
			const rest = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();

			if (sub === "off") {
				autoTriggerMuted = true;
				ctx.ui.notify("Wayfinder auto-trigger muted for this session (/skill:route still works).", "info");
				return;
			}
			if (sub === "on") {
				autoTriggerMuted = false;
				ctx.ui.notify("Wayfinder auto-trigger enabled for this session.", "info");
				return;
			}
			if (sub === "route") {
				if (!rest) {
					ctx.ui.notify("Usage: /wayfinder route <task or symptom>", "warning");
					return;
				}
				if (ctx.isIdle()) {
					pi.sendUserMessage(`/skill:route ${rest}`, { expandPromptTemplates: true });
				} else {
					pi.sendUserMessage(`/skill:route ${rest}`, {
						deliverAs: "followUp",
						expandPromptTemplates: true,
					});
				}
				return;
			}
			if (sub === "ledger") {
				const out = await runWayfinderCli(["ledger", "show"]);
				showInfo(`ledger (${defaultDataDir()})`, out, ctx.hasUI);
				return;
			}
			if (sub === "misses") {
				const out = await runWayfinderCli(["ledger", "misses"]);
				showInfo("misses", out, ctx.hasUI);
				return;
			}

			// Default: status
			const statusTable = readCardsStatus();
			const modeLine = `Auto-trigger: ${autoTriggerMuted ? "muted (/wayfinder on to enable)" : "active"}  |  Data: ${defaultDataDir()}`;
			showInfo("status", `${modeLine}\n\n${statusTable}`, ctx.hasUI);
		},
	});

	// Deferred tools: 0 always-on tokens in active tool declarations and codemode inline listings,
	// while remaining callable from codemode scripts, tool_search, and restricted eval runs.
	pi.registerTool({
		name: "wayfinder_ledger",
		label: "Wayfinder Ledger",
		exposure: "deferred",
		description: "Read or append Wayfinder recommendation ledger entries (show, misses, or add).",
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
		parameters: Type.Object({
			action: StringEnum(["show", "misses", "add"] as const, {
				description: "Ledger action to run",
			}),
			event: Type.Optional(
				StringEnum(["recommended", "adopted", "declined", "miss", "stale-hit"] as const, {
					description: "Event type when action is 'add'",
				}),
			),
			card: Type.Optional(Type.String({ description: "Card id" })),
			reason: Type.Optional(Type.String({ description: "Reason when declining" })),
			query: Type.Optional(Type.String({ description: "Generic task query when logging a miss" })),
			since: Type.Optional(Type.String({ description: "ISO date filter YYYY-MM-DD for 'show'" })),
			dataDir: Type.Optional(Type.String({ description: "Optional override for ledger directory" })),
		}),
		async execute(_toolCallId, params) {
			const args: string[] = ["ledger", params.action];
			if (params.action === "add") {
				if (!params.event) {
					return {
						content: [{ type: "text", text: "wayfinder: ledger add requires 'event'" }],
						details: {},
					};
				}
				args.push(params.event);
			}
			if (params.dataDir) args.push("--data", params.dataDir);
			if (params.card) args.push("--card", params.card);
			if (params.reason) args.push("--reason", params.reason);
			if (params.query) args.push("--query", params.query);
			if (params.since && params.action === "show") args.push("--since", params.since);

			const output = await runWayfinderCli(args);
			return {
				content: [{ type: "text", text: output }],
				details: { action: params.action },
			};
		},
	});

	pi.registerTool({
		name: "wayfinder_catalog",
		label: "Wayfinder Catalog Search",
		exposure: "deferred",
		description: "Search npm pi-package registry entries by keywords (returns untrusted catalog data).",
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		parameters: Type.Object({
			terms: Type.Array(Type.String(), {
				minItems: 1,
				maxItems: 8,
				description: "Three to five search keywords",
			}),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 25, description: "Max entries (default 12)" })),
		}),
		async execute(_toolCallId, params) {
			const args = ["catalog", "search", ...params.terms];
			if (params.limit !== undefined) args.push("--limit", String(params.limit));
			const output = await runWayfinderCli(args, 20_000);
			return {
				content: [{ type: "text", text: output }],
				details: { terms: params.terms },
			};
		},
	});

	pi.registerTool({
		name: "wayfinder_scout",
		label: "Wayfinder Scout",
		exposure: "deferred",
		description:
			"Run an isolated read-only Pi scout subprocess to evaluate candidate tools or re-check stale card sources against RUBRIC.md.",
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		parameters: Type.Object({
			task: Type.String({
				description: "One generic sentence describing the task (no file names, company names, or code)",
			}),
			catalog: Type.Optional(Type.String({ description: "Catalog lines from wayfinder catalog search" })),
			installed: Type.Optional(Type.String({ description: "Packages, skills, or MCP servers already installed" })),
			recheck: Type.Optional(Type.String({ description: "Stale card sources and claims to re-verify" })),
		}),
		async execute(_toolCallId, params) {
			const args = ["scout", "--task", params.task];
			if (params.catalog) args.push("--catalog", params.catalog);
			if (params.installed) args.push("--installed", params.installed);
			if (params.recheck) args.push("--recheck", params.recheck);
			const output = await runWayfinderCli(args, 190_000);
			return {
				content: [{ type: "text", text: output }],
				details: { task: params.task },
			};
		},
	});
}
