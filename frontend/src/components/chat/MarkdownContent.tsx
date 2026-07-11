import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { Play } from "lucide-react";
import {
	MermaidDiagram,
	MermaidStreamingPlaceholder,
} from "@/components/chat/MermaidDiagram";
import {
	AsciiDiagram,
	AsciiDiagramPlaceholder,
} from "@/components/chat/AsciiDiagram";
import { shouldRenderAsciiDiagram } from "@/lib/asciiDiagramUtils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
	content: string;
	className?: string;
	inverted?: boolean;
	isStreaming?: boolean;
}

function CodeBlockWithPlayground({
	lang,
	code,
	isStreaming,
}: {
	lang?: string;
	code: string;
	isStreaming?: boolean;
}) {
	const navigate = useNavigate();

	if (lang === "mermaid") {
		if (isStreaming) {
			return <MermaidStreamingPlaceholder chart={code} />;
		}
		return <MermaidDiagram chart={code} />;
	}

	if (shouldRenderAsciiDiagram(code, lang)) {
		if (isStreaming) {
			return <AsciiDiagramPlaceholder title="Flowchart" />;
		}
		return <AsciiDiagram code={code} title="Flowchart" />;
	}

	const runInSandbox = () => {
		const params = new URLSearchParams();
		if (lang) params.set("lang", lang);
		params.set("code", code);
		navigate(`/sandbox?${params.toString()}`);
	};

	return (
		<div className="group/code relative my-3">
			{lang && lang !== "text" && (
				<Button
					variant="ghost"
					size="sm"
					className="absolute right-1.5 top-1.5 h-6 gap-1 px-2 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/code:opacity-100"
					onClick={runInSandbox}
				>
					<Play className="h-3 w-3" />
					Run
				</Button>
			)}
			<pre className="overflow-x-auto rounded-lg bg-muted/50 px-3 py-2.5 text-[13px] leading-relaxed">
				<code className="font-mono whitespace-pre text-foreground">{code}</code>
			</pre>
		</div>
	);
}

export function MarkdownContent({
	content,
	className,
	inverted,
	isStreaming = false,
}: MarkdownContentProps) {
	const components = useMemo((): Components => {
		return {
			code({ className: codeClassName, children, ...props }) {
				const match = /language-(\w+)/.exec(codeClassName || "");
				const lang = match?.[1];
				const code = String(children).replace(/\n$/, "");
				const isBlock = codeClassName?.includes("language-");

				if (isBlock) {
					return (
						<CodeBlockWithPlayground
							lang={lang}
							code={code}
							isStreaming={isStreaming}
						/>
					);
				}

				return (
					<code
						className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.85em] text-foreground"
						{...props}
					>
						{children}
					</code>
				);
			},
			pre({ children }) {
				return <>{children}</>;
			},
		};
	}, [isStreaming]);

	return (
		<div
			className={cn(
				"prose prose-sm max-w-none text-foreground prose-headings:font-semibold prose-headings:tracking-tight prose-p:my-2 prose-p:leading-relaxed prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2 [&>*:last-child]:mb-0",
				inverted && "prose-invert",
				className,
			)}
		>
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
				{content}
			</ReactMarkdown>
		</div>
	);
}
