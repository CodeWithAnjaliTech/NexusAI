import { useState } from "react";
import { Check, Copy, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/stores/toastStore";

interface AsciiDiagramProps {
	code: string;
	title?: string;
}

export function AsciiDiagram({ code, title = "Flowchart" }: AsciiDiagramProps) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		await navigator.clipboard.writeText(code);
		setCopied(true);
		toast.success("Diagram copied");
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="diagram-shell my-4 overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-muted/25 to-muted/10 shadow-sm">
			<div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
				<div className="flex items-center gap-2">
					<GitBranch className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
					<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						{title}
					</span>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-muted-foreground hover:text-foreground"
					onClick={copy}
					title="Copy diagram"
				>
					{copied ? (
						<Check className="h-3.5 w-3.5" />
					) : (
						<Copy className="h-3.5 w-3.5" />
					)}
				</Button>
			</div>
			<div className="overflow-x-auto p-3 sm:p-4">
				<pre className="ascii-diagram-canvas mx-auto w-fit min-w-[min(100%,20rem)] rounded-lg border border-border/50 bg-[#1a1a1a] px-4 py-5 text-[11px] leading-[1.35] text-[#e8e8e8] shadow-inner sm:text-xs sm:leading-[1.4] dark:bg-[#0f0f0f]">
					<code className="font-mono whitespace-pre">{code}</code>
				</pre>
			</div>
		</div>
	);
}

export function AsciiDiagramPlaceholder({ title = "Flowchart" }: { title?: string }) {
	return (
		<div className="diagram-shell my-4 overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-muted/25 to-muted/10 shadow-sm">
			<div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
				<GitBranch className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
				<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
					{title}
				</span>
			</div>
			<div className="flex min-h-[160px] items-center justify-center px-4 py-8 text-center">
				<p className="text-sm text-muted-foreground">Building flowchart…</p>
			</div>
		</div>
	);
}
