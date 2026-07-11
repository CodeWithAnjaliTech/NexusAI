/** Helpers for safe Mermaid rendering in chat markdown. */

const MERMAID_KEYWORD =
	/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|timeline|mindmap|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|block-beta|xychart-beta|sankey-beta|architecture-beta|packet-beta|kanban)/i;

const BARE_MERMAID_LINE =
	/^(?:flowchart|graph)\s+[A-Z]{2}\b/i;

const BARE_SEQUENCE_LINE = /^\s*sequenceDiagram\b/i;

const FLOWCHART_HEADER = /^(?:flowchart|graph)\s+[A-Z]{2}\b/i;

const SEQUENCE_MARKERS =
	/\bparticipant\s+|--?>>|\+>>|\-\)|\bactivate\s+|\bdeactivate\s+|\bNote over\b|\bNote right of\b|\bloop\s+|\balt\s+|\bopt\s+|\bpar\s+/i;

export type DiagramKind =
	| "flowchart"
	| "sequence"
	| "class"
	| "state"
	| "gantt"
	| "other";

/** True when every ```mermaid fence in the document is closed. */
export function hasCompleteMermaidFences(content: string): boolean {
	const lines = content.split("\n");
	let open = false;

	for (const line of lines) {
		const trimmed = line.trim().toLowerCase();
		if (trimmed.startsWith("```mermaid")) {
			if (open) return false;
			open = true;
			continue;
		}
		if (open && trimmed.startsWith("```")) {
			open = false;
		}
	}

	return !open;
}

/** True when this mermaid block's closing fence exists in the full markdown. */
export function isMermaidBlockComplete(
	fullContent: string,
	blockCode: string,
): boolean {
	const trimmed = repairMermaidSyntax(blockCode.trim());
	if (!trimmed) return false;

	const re = /```mermaid\s*\n([\s\S]*?)\n```/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(fullContent)) !== null) {
		const fenced = repairMermaidSyntax(match[1].trim());
		if (fenced === trimmed) return true;
	}

	if (!hasCompleteMermaidFences(fullContent)) return false;

	const fenceCount = (fullContent.match(/```mermaid/gi) || []).length;
	if (fenceCount === 1 && isLikelyValidMermaid(trimmed)) return true;

	return false;
}

export function normalizeMermaidChart(chart: string): string {
	return chart
		.replace(/^\uFEFF/, "")
		.replace(/\r\n/g, "\n")
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.replace(/^graph(\s+[A-Z]{2}\b)/im, "flowchart$1")
		.trim();
}

export function looksLikeSequenceDiagram(text: string): boolean {
	const normalized = normalizeMermaidChart(text);
	if (/^\s*sequenceDiagram\b/im.test(normalized)) return true;
	if (!SEQUENCE_MARKERS.test(normalized)) return false;
	return (
		/\bparticipant\s+/i.test(normalized) ||
		/--?>>/.test(normalized) ||
		/^\s*\w[\w\s]*?->>/im.test(normalized)
	);
}

function convertMixedToSequenceDiagram(text: string): string {
	const lines = text.split("\n");
	const body: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			body.push("");
			continue;
		}
		if (FLOWCHART_HEADER.test(trimmed)) continue;
		if (/^(?:graph|flowchart)\b/i.test(trimmed) && !FLOWCHART_HEADER.test(trimmed)) {
			continue;
		}
		body.push(line.replace(/^\s+participant\b/i, "participant"));
	}

	const bodyText = body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
	return bodyText ? `sequenceDiagram\n${bodyText}` : "sequenceDiagram";
}

const PARTICIPANT_LINE =
	/^participant\s+([A-Za-z_][\w]*)(?:\s+as\s+(.+))?$/i;

const SEQUENCE_ARROW =
	/^([A-Za-z_][\w]*)\s*(->>|-->>|->|--)\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_][\w]*))\s*:\s*(.*)$/;

function stripQuotes(value: string): string {
	return value.replace(/^["']|["']$/g, "").trim();
}

function toParticipantId(name: string): string {
	const cleaned = stripQuotes(name).replace(/[^\w]/g, "");
	if (!cleaned) return "Actor";
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function resolveParticipantId(
	name: string,
	declared: Map<string, string>,
): string {
	const raw = stripQuotes(name);
	if (declared.has(raw)) return raw;
	for (const [id, label] of declared.entries()) {
		if (stripQuotes(label) === raw || id.toLowerCase() === raw.toLowerCase()) {
			return id;
		}
	}
	const id = toParticipantId(raw);
	declared.set(id, raw);
	return id;
}

function formatParticipantLine(id: string, label: string): string {
	const cleanLabel = stripQuotes(label);
	if (!cleanLabel || cleanLabel === id) {
		return `participant ${id}`;
	}
	if (/[\s-]/.test(cleanLabel)) {
		return `participant ${id} as "${cleanLabel.replace(/"/g, "'")}"`;
	}
	return `participant ${id} as ${cleanLabel}`;
}

/** Fix LLM sequence mistakes: missing participants, quoted arrow targets, --> vs ->>. */
function repairSequenceDiagram(text: string, opts?: { stripNotes?: boolean }): string {
	let body = text.trim();
	if (!/^\s*sequenceDiagram\b/im.test(body)) {
		body = convertMixedToSequenceDiagram(body);
	}

	const lines = body.split("\n").slice(1);
	const declared = new Map<string, string>();
	const contentLines: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const participantMatch = trimmed.match(PARTICIPANT_LINE);
		if (participantMatch) {
			const [, id, label] = participantMatch;
			declared.set(id, label?.trim() || id);
			continue;
		}

		const arrowMatch = trimmed.match(SEQUENCE_ARROW);
		if (arrowMatch) {
			const [, from, arrow, qTarget, sqTarget, bareTarget, message] = arrowMatch;
			const targetRaw = qTarget || sqTarget || bareTarget || "";
			resolveParticipantId(from, declared);
			const toId = resolveParticipantId(targetRaw, declared);
			const fixedArrow = arrow === "-->" || arrow === "->" ? "->>" : arrow;
			contentLines.push(`${from}${fixedArrow}${toId}: ${message.trim()}`);
			continue;
		}

		if (/^Note over/i.test(trimmed)) {
			if (!opts?.stripNotes) contentLines.push(trimmed);
			continue;
		}

		if (/^(activate|deactivate|loop|alt|else|opt|par|and|end)\b/i.test(trimmed)) {
			contentLines.push(trimmed);
		}
	}

	const out: string[] = ["sequenceDiagram"];
	for (const [id, label] of declared.entries()) {
		out.push(formatParticipantLine(id, label));
	}
	if (contentLines.length > 0) {
		out.push("");
		out.push(...contentLines);
	}

	return out.join("\n").trim();
}

function normalizeSequenceBody(text: string): string {
	return repairSequenceDiagram(text);
}

function repairFlowchartSyntax(text: string): string {
	let result = text;
	result = result.replace(/(?<!-)\s->\s+/g, " --> ");
	result = result.replace(/(?<!-)->(?=\s*[A-Za-z0-9_[("])/g, " --> ");

	const lines = result.split("\n");
	const first = lines[0]?.trim() ?? "";

	if (BARE_MERMAID_LINE.test(first)) {
		const headerMatch = first.match(/^((?:flowchart|graph)\s+[A-Z]{2})\s*(.*)$/i);
		if (headerMatch) {
			const [, header, inlineBody] = headerMatch;
			const bodyLines = inlineBody ? [inlineBody, ...lines.slice(1)] : lines.slice(1);
			const body = bodyLines
				.join("\n")
				.replace(/\]\s+(?=[A-Za-z_][\w[\("]*)/g, "]\n")
				.replace(/\)\s+(?=[A-Za-z_][\w[\("]*)/g, ")\n")
				.trim();
			result = body ? `${header}\n${body}` : header;
		}
	}

	return result.trim();
}

/** Fix common LLM mermaid mistakes (mixed types, arrows, single-line diagrams). */
export function repairMermaidSyntax(chart: string): string {
	let text = normalizeMermaidChart(chart);
	if (!text) return text;

	if (looksLikeSequenceDiagram(text)) {
		return normalizeSequenceBody(text);
	}

	return repairFlowchartSyntax(text);
}

export function getDiagramKind(chart: string): DiagramKind {
	const text = repairMermaidSyntax(chart);
	const firstLine = text.split("\n")[0]?.trim().toLowerCase() ?? "";

	if (firstLine.startsWith("sequenceDiagram") || looksLikeSequenceDiagram(text)) {
		return "sequence";
	}
	if (firstLine.startsWith("flowchart") || firstLine.startsWith("graph")) {
		return "flowchart";
	}
	if (firstLine.startsWith("classDiagram")) return "class";
	if (firstLine.startsWith("statediagram")) return "state";
	if (firstLine.startsWith("gantt")) return "gantt";
	return "other";
}

export function getDiagramLabel(kind: DiagramKind): string {
	switch (kind) {
		case "flowchart":
			return "Flowchart";
		case "sequence":
			return "Sequence";
		case "class":
			return "Class diagram";
		case "state":
			return "State diagram";
		case "gantt":
			return "Timeline";
		default:
			return "Diagram";
	}
}

export function isLikelyValidMermaid(chart: string): boolean {
	const text = repairMermaidSyntax(chart);
	if (!text || text.length < 3) return false;

	const firstLine = text.split("\n")[0]?.trim() ?? "";
	return (
		MERMAID_KEYWORD.test(firstLine) ||
		looksLikeSequenceDiagram(text) ||
		text.includes("-->") ||
		text.includes("---") ||
		/--?>>/.test(text)
	);
}

/** Build render candidates from most repaired to least modified. */
export function mermaidRenderCandidates(chart: string): string[] {
	const repaired = repairMermaidSyntax(chart);
	const normalized = normalizeMermaidChart(chart);
	const sequenceFull = looksLikeSequenceDiagram(chart)
		? repairSequenceDiagram(
				/^\s*sequenceDiagram/im.test(normalizeMermaidChart(chart))
					? normalizeMermaidChart(chart)
					: convertMixedToSequenceDiagram(chart),
			)
		: null;
	const sequenceNoNotes =
		sequenceFull != null ? repairSequenceDiagram(sequenceFull, { stripNotes: true }) : null;

	return [
		...new Set(
			[repaired, sequenceFull, sequenceNoNotes, normalized, chart].filter(Boolean),
		),
	] as string[];
}

/** Wrap unfenced flowchart/graph blocks so react-markdown can render them. */
export function wrapBareMermaidBlocks(content: string): string {
	let result = content.replace(
		/```mermaid\s*\n([\s\S]*?)\n```/gi,
		(_, body: string) => {
			return "```mermaid\n" + repairMermaidSyntax(body) + "\n```";
		},
	);

	if (/```mermaid/i.test(result)) return result;

	const lines = result.split("\n");
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();

		if (BARE_MERMAID_LINE.test(trimmed) || BARE_SEQUENCE_LINE.test(trimmed)) {
			const block: string[] = [trimmed];
			i += 1;
			while (i < lines.length) {
				const next = lines[i].trim();
				if (!next) break;
				if (/^#{1,6}\s/.test(next) || next.startsWith("```")) break;
				if (
					/^[A-Za-z].*:\s*$/.test(next) &&
					!next.includes("-->") &&
					!next.includes("->") &&
					!next.includes("->>")
				) {
					break;
				}
				block.push(lines[i].trimEnd());
				i += 1;
			}
			out.push("```mermaid");
			out.push(repairMermaidSyntax(block.join("\n")));
			out.push("```");
			continue;
		}

		if (/\bparticipant\s+/i.test(trimmed) && i + 1 < lines.length) {
			const peek = lines.slice(i, i + 6).join("\n");
			if (/--?>>/.test(peek)) {
				const block: string[] = [];
				while (i < lines.length) {
					const next = lines[i].trim();
					if (!next) break;
					if (/^#{1,6}\s/.test(next) || next.startsWith("```")) break;
					if (
						!/^(participant\s+|.*--?>>.*|\w[\w\s]*->>.*)$/i.test(next) &&
						block.length > 0
					) {
						break;
					}
					block.push(lines[i].trimEnd());
					i += 1;
				}
				if (block.length > 0) {
					out.push("```mermaid");
					out.push(repairMermaidSyntax(block.join("\n")));
					out.push("```");
					continue;
				}
			}
		}

		out.push(line);
		i += 1;
	}

	return out.join("\n");
}

export function prepareMermaidMarkdown(content: string): string {
	return wrapBareMermaidBlocks(content);
}
