/** Detect and normalize ChatGPT-style ASCII box flowcharts. */

import { wrapBareMermaidBlocks } from "@/lib/mermaidUtils";

const BOX_DRAWING = /[┌┐└┘├┤┬┴┼─│▼▲←→↔]/;
const ASCII_DIAGRAM_LANGS = new Set(["flowchart", "diagram", "ascii"]);

export function isAsciiDiagramLanguage(lang?: string): boolean {
	if (!lang) return false;
	return ASCII_DIAGRAM_LANGS.has(lang.toLowerCase());
}

export function isAsciiBoxDiagram(code: string): boolean {
	const trimmed = code.trim();
	if (trimmed.length < 20) return false;

	const lines = trimmed.split("\n");
	if (lines.length < 3) return false;

	const boxLines = lines.filter((line) => BOX_DRAWING.test(line)).length;
	if (boxLines < 2) return false;

	return boxLines / lines.length >= 0.1;
}

export function shouldRenderAsciiDiagram(code: string, lang?: string): boolean {
	const normalized = lang?.toLowerCase();
	if (normalized === "flowchart" || normalized === "diagram" || normalized === "ascii") {
		return true;
	}
	return isAsciiBoxDiagram(code);
}

/** Wrap unfenced ASCII box art so markdown renders it in the diagram card. */
export function wrapBareAsciiDiagrams(content: string): string {
	if (/```flowchart/i.test(content)) return content;

	const lines = content.split("\n");
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		if (/^\s*┌/.test(line)) {
			const block: string[] = [];
			while (i < lines.length) {
				const current = lines[i];
				if (
					block.length > 0 &&
					!current.trim() &&
					!lines.slice(i + 1, i + 3).some((l) => BOX_DRAWING.test(l))
				) {
					break;
				}
				if (
					block.length > 0 &&
					!BOX_DRAWING.test(current) &&
					!/^\s*(No|Yes|Is Valid|Decision|\?\s*$)/i.test(current.trim())
				) {
					break;
				}
				block.push(current);
				i += 1;
			}
			if (block.some((l) => BOX_DRAWING.test(l))) {
				out.push("```flowchart");
				out.push(block.join("\n").trimEnd());
				out.push("```");
				continue;
			}
		}

		out.push(line);
		i += 1;
	}

	return out.join("\n");
}

export function prepareChatMarkdown(content: string): string {
	return wrapBareAsciiDiagrams(wrapBareMermaidBlocks(content));
}
