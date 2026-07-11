import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { php } from "@codemirror/lang-php";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
const LANGUAGE_EXTENSIONS: Record<string, Extension[]> = {
  python: [python()],
  javascript: [javascript({ jsx: false })],
  typescript: [javascript({ jsx: false, typescript: true })],
  java: [java()],
  kotlin: [java()],
  scala: [java()],
  c: [cpp()],
  cpp: [cpp()],
  rust: [rust()],
  php: [php()],
  sql: [sql()],
};

interface CodeEditorProps {
  value: string;
  language: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  darkMode?: boolean;
  minHeight?: string;
}

export function CodeEditor({
  value,
  language,
  onChange,
  onRun,
  darkMode = false,
  minHeight = "360px",
}: CodeEditorProps) {
  const extensions = useMemo(() => {
    const langExt = LANGUAGE_EXTENSIONS[language] ?? [];
    const runExt = onRun
      ? keymap.of([{ key: "Mod-Enter", run: () => { onRun(); return true; } }])
      : [];
    return [...langExt, runExt];
  }, [language, onRun]);

  return (
    <CodeMirror
      value={value}
      height={minHeight}
      theme={darkMode ? oneDark : "light"}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: true,
        bracketMatching: true,
        indentOnInput: true,
      }}
      className="overflow-hidden rounded-xl border border-border text-sm [&_.cm-editor]:outline-none [&_.cm-scroller]:font-mono"
    />
  );
}
