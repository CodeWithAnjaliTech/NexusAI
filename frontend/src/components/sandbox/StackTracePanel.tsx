interface StackFrame {
  file: string;
  line: number;
  function: string;
  code?: string | null;
}

interface ParsedTrace {
  exception_type: string;
  message: string;
  frames: StackFrame[];
  root_cause?: string | null;
  summary: string;
}

interface StackTracePanelProps {
  trace: ParsedTrace;
}

export function StackTracePanel({ trace }: StackTracePanelProps) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-semibold text-destructive">
        {trace.exception_type}: {trace.message}
      </p>
      {trace.root_cause && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Root cause:</span> {trace.root_cause}
        </p>
      )}
      {trace.frames.length > 0 && (
        <ul className="mt-3 space-y-2 font-mono text-xs">
          {trace.frames.map((f, i) => (
            <li key={i} className="rounded-lg bg-background/80 p-2">
              <span className="text-muted-foreground">
                {f.file}:{f.line}
              </span>{" "}
              in <span className="font-medium">{f.function}</span>
              {f.code && <pre className="mt-1 text-destructive/90">{f.code}</pre>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{trace.summary}</p>
    </div>
  );
}
