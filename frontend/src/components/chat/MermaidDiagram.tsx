import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GitBranch, ChevronDown, ChevronUp } from "lucide-react";
import mermaid from "mermaid";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/chatStore";
import { cn } from "@/lib/utils";
import {
	getDiagramKind,
	getDiagramLabel,
	isLikelyValidMermaid,
	mermaidRenderCandidates,
	repairMermaidSyntax,
} from "@/lib/mermaidUtils";

interface MermaidDiagramProps {
	chart: string;
}

let mermaidReady = false;

function buildMermaidConfig(dark: boolean) {
	return {
		startOnLoad: false,
		theme: "base" as const,
		themeVariables: dark
			? {
					background: "#0a0a0a",
					mainBkg: "#262626",
					primaryColor: "#262626",
					primaryTextColor: "#fafafa",
					primaryBorderColor: "#525252",
					secondaryColor: "#171717",
					tertiaryColor: "#404040",
					lineColor: "#a3a3a3",
					textColor: "#fafafa",
					titleColor: "#fafafa",
					nodeBorder: "#525252",
					clusterBkg: "#171717",
					clusterBorder: "#525252",
					edgeLabelBackground: "#262626",
					actorBkg: "#262626",
					actorBorder: "#525252",
					actorTextColor: "#fafafa",
					actorLineColor: "#737373",
					signalColor: "#d4d4d4",
					signalTextColor: "#fafafa",
					labelBoxBkgColor: "#262626",
					labelBoxBorderColor: "#525252",
					labelTextColor: "#fafafa",
					loopTextColor: "#fafafa",
					noteBkgColor: "#404040",
					noteTextColor: "#fafafa",
					noteBorderColor: "#525252",
					fontFamily: "Inter, system-ui, sans-serif",
					fontSize: "14px",
				}
			: {
					background: "#ffffff",
					mainBkg: "#f5f5f5",
					primaryColor: "#f5f5f5",
					primaryTextColor: "#0a0a0a",
					primaryBorderColor: "#d4d4d4",
					secondaryColor: "#e5e5e5",
					tertiaryColor: "#fafafa",
					lineColor: "#737373",
					textColor: "#0a0a0a",
					titleColor: "#0a0a0a",
					nodeBorder: "#d4d4d4",
					clusterBkg: "#e5e5e5",
					clusterBorder: "#d4d4d4",
					edgeLabelBackground: "#f5f5f5",
					actorBkg: "#f5f5f5",
					actorBorder: "#d4d4d4",
					actorTextColor: "#0a0a0a",
					actorLineColor: "#737373",
					signalColor: "#525252",
					signalTextColor: "#0a0a0a",
					labelBoxBkgColor: "#f5f5f5",
					labelBoxBorderColor: "#d4d4d4",
					labelTextColor: "#0a0a0a",
					loopTextColor: "#0a0a0a",
					noteBkgColor: "#e5e5e5",
					noteTextColor: "#0a0a0a",
					noteBorderColor: "#d4d4d4",
					fontFamily: "Inter, system-ui, sans-serif",
					fontSize: "14px",
				},
		flowchart: {
			htmlLabels: true,
			curve: "basis" as const,
			padding: 18,
			nodeSpacing: 52,
			rankSpacing: 58,
			diagramPadding: 12,
			useMaxWidth: true,
		},
		sequence: {
			diagramMarginX: 24,
			diagramMarginY: 14,
			actorMargin: 60,
			width: 160,
			height: 48,
			boxMargin: 8,
			boxTextMargin: 6,
			noteMargin: 8,
			messageMargin: 42,
			mirrorActors: false,
			useMaxWidth: true,
			rightAngles: false,
		},
		securityLevel: "loose" as const,
		suppressErrorRendering: true,
	};
}

function ensureMermaidInitialized(dark: boolean) {
	mermaid.initialize(buildMermaidConfig(dark));
	mermaidReady = true;
}

function isBrokenSvg(svg: string): boolean {
	return (
		svg.includes("error-icon") ||
		svg.includes("Syntax error in text") ||
		svg.includes("aria-roledescription=\"error\"")
	);
}

async function renderMermaidSvg(
	chart: string,
	dark: boolean,
): Promise<{ svg: string; bindFunctions?: (el: Element) => void }> {
	ensureMermaidInitialized(dark);
	const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
	return mermaid.render(id, chart);
}

function DiagramShell({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="diagram-shell my-4 overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-muted/25 to-muted/10 shadow-sm">
			<div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
				<GitBranch className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
				<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
					{label}
				</span>
			</div>
			<div className="p-3 sm:p-4">{children}</div>
		</div>
	);
}

function DiagramSkeleton({ animated = true }: { animated?: boolean }) {
	return (
		<div className="space-y-3" aria-hidden>
			<div className="flex items-center justify-center gap-3 py-2">
				<div
					className={cn(
						"h-10 w-24 rounded-lg bg-muted/70",
						animated && "animate-pulse",
					)}
				/>
				<div
					className={cn("h-px flex-1 bg-border", animated && "animate-pulse")}
				/>
				<div
					className={cn(
						"h-10 w-24 rounded-lg bg-muted/70",
						animated && "animate-pulse",
					)}
				/>
				<div
					className={cn("h-px flex-1 bg-border", animated && "animate-pulse")}
				/>
				<div
					className={cn(
						"h-10 w-24 rounded-lg bg-muted/70",
						animated && "animate-pulse",
					)}
				/>
			</div>
			<div
				className={cn(
					"mx-auto h-2 w-4/5 rounded-full bg-muted/60",
					animated && "animate-pulse",
				)}
			/>
			<p className="pt-1 text-center text-xs text-muted-foreground">
				Rendering diagram…
			</p>
		</div>
	);
}

function MermaidFallback({ chart }: { chart: string }) {
	const [showSource, setShowSource] = useState(false);
	const label = getDiagramLabel(getDiagramKind(chart));

	return (
		<DiagramShell label={label}>
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					This diagram could not be rendered. The source is shown below.
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-8 gap-1.5 text-xs"
					onClick={() => setShowSource((v) => !v)}
				>
					{showSource ? (
						<ChevronUp className="h-3.5 w-3.5" />
					) : (
						<ChevronDown className="h-3.5 w-3.5" />
					)}
					{showSource ? "Hide source" : "View source"}
				</Button>
				{showSource && (
					<pre className="overflow-x-auto rounded-lg border border-border/60 bg-background/80 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
						<code>{chart}</code>
					</pre>
				)}
			</div>
		</DiagramShell>
	);
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
	const darkMode = useThemeStore((s) => s.darkMode);
	const canvasRef = useRef<HTMLDivElement>(null);
	const renderedKeyRef = useRef<string | null>(null);
	const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
	const repaired = useMemo(() => repairMermaidSyntax(chart), [chart]);
	const label = useMemo(() => getDiagramLabel(getDiagramKind(repaired)), [repaired]);

	useEffect(() => {
		let cancelled = false;

		if (!repaired || !isLikelyValidMermaid(repaired)) {
			setStatus("failed");
			return;
		}

		if (renderedKeyRef.current === repaired) {
			setStatus("ready");
			return;
		}

		setStatus((prev) => (prev === "ready" ? "ready" : "loading"));

		const run = async () => {
			const el = canvasRef.current;
			if (!el) return;

			const candidates = mermaidRenderCandidates(chart);

			for (const candidate of candidates) {
				if (cancelled) return;
				try {
					const { svg, bindFunctions } = await renderMermaidSvg(
						candidate,
						darkMode,
					);
					if (cancelled) return;
					if (isBrokenSvg(svg)) continue;

					el.innerHTML = svg;
					bindFunctions?.(el);
					renderedKeyRef.current = repaired;
					setStatus("ready");
					return;
				} catch {
					// try next repaired candidate
				}
			}

			if (!cancelled) setStatus("failed");
		};

		void run();

		return () => {
			cancelled = true;
		};
	}, [chart, repaired, darkMode]);

	if (status === "failed") {
		return <MermaidFallback chart={repaired || chart} />;
	}

	return (
		<DiagramShell label={label}>
			{status === "loading" && <DiagramSkeleton animated={false} />}
			<div
				ref={canvasRef}
				className={cn(
					"diagram-canvas overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full [&_svg]:h-auto",
					status === "loading" && "sr-only",
				)}
				role="img"
				aria-label={`${label} visualization`}
				aria-busy={status === "loading"}
			/>
		</DiagramShell>
	);
}

/** Stable placeholder while the mermaid block is still streaming — no re-mount flicker. */
export function MermaidStreamingPlaceholder({ chart }: { chart: string }) {
	const label = getDiagramLabel(getDiagramKind(repairMermaidSyntax(chart)));

	return (
		<DiagramShell label={label}>
			<div className="flex min-h-[140px] items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/15 px-4 py-8 text-center">
				<p className="text-sm text-muted-foreground">Building diagram…</p>
			</div>
		</DiagramShell>
	);
}
// Warm up mermaid once on module load so first diagram renders faster.
if (typeof window !== "undefined" && !mermaidReady) {
	ensureMermaidInitialized(false);
}
