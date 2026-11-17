import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { cn } from "@/lib/utils";
import { useScheme } from "@/lib/theme";

const LANGS = { js: javascript, html, css, json, markdown };

const theme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "13.5px" },
  ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid var(--border)", color: "var(--muted-foreground)" },
  ".cm-content": { fontFamily: '"Comfortaa", sans-serif', fontSize: "13.5px", fontWeight: "500", letterSpacing: "0.02em", fontFeatureSettings: '"tnum"', whiteSpace: "pre" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in oklab, var(--foreground) 4%, transparent)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { lineHeight: "1.6", fontFamily: '"Comfortaa", sans-serif', scrollbarColor: "#d2d2d6 transparent", scrollbarWidth: "thin" },
});

export function CodeEditor({
  value,
  onChange,
  lang,
  minHeight = 120,
  maxHeight,
  className,
  lineNumbers = true,
  placeholder,
}: {
  value: string;
  onChange(v: string): void;
  lang: keyof typeof LANGS;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  lineNumbers?: boolean;
  placeholder?: string;
}) {
  const scheme = useScheme();
  return (
    <div className={cn("overflow-hidden rounded-md border bg-background/40 focus-within:border-ring", className)}>
      <CodeMirror
        value={value}
        onChange={onChange}
        theme={scheme === "light" ? "light" : oneDark}
        extensions={[LANGS[lang](), theme]}
        basicSetup={{ lineNumbers, foldGutter: false, highlightActiveLine: true, autocompletion: lang !== "markdown" }}
        minHeight={`${minHeight}px`}
        maxHeight={maxHeight ? `${maxHeight}px` : undefined}
        placeholder={placeholder}
      />
    </div>
  );
}
