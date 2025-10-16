"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import styles from "./MarkdownEditor.module.css";

type TransformArgs = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

type TransformResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

type FormattingAction = {
  id: string;
  label: string;
  hint: string;
  transform: (args: TransformArgs) => TransformResult;
};

const STORAGE_KEY = "quick-writer-draft";

const STARTER_TEMPLATE = `# Quick Writer

Jot ideas, draft copy, or outline tasks. This editor keeps your markdown in sync locally so you can close the tab and pick up where you left off.

## Quick tips

- Use the toolbar or keyboard shortcuts for common formatting.
- Preview updates instantly — perfect for verifying headings, lists, and code snippets.
- Everything is stored in your browser only. Clear or reset any time.

### Try it out

- [ ] Capture a thought
- [ ] Drop a reference link: https://vercel.com
- [ ] Paste sample code:

\`\`\`ts
export const hello = (name: string) => {
  return \`Hey \${name}! Ready to ship?\`;
};
\`\`\`
`;

const wrapSelection =
  (before: string, after: string, placeholder: string) =>
  ({ text, selectionStart, selectionEnd }: TransformArgs): TransformResult => {
    const selected = text.slice(selectionStart, selectionEnd);
    const hasSelection = selected.length > 0;
    const content = hasSelection ? selected : placeholder;
    const value = `${text.slice(0, selectionStart)}${before}${content}${after}${text.slice(selectionEnd)}`;
    const start = selectionStart + before.length;
    const end = start + content.length;
    return { value, selectionStart: start, selectionEnd: end };
  };

const prefixLines =
  (prefix: string, placeholder: string) =>
  ({ text, selectionStart, selectionEnd }: TransformArgs): TransformResult => {
    const before = text.slice(0, selectionStart);
    const after = text.slice(selectionEnd);
    const selected = text.slice(selectionStart, selectionEnd);
    const content = selected.length > 0 ? selected : placeholder;
    const lines = content.split(/\r?\n/);
    const transformed = lines
      .map((line) => (line.trim().length ? `${prefix}${line}` : `${prefix}`))
      .join("\n");
    const value = `${before}${transformed}${after}`;
    const end = selectionStart + transformed.length;
    return { value, selectionStart: end, selectionEnd: end };
  };

const headingTransform =
  (level: number) =>
  ({ text, selectionStart, selectionEnd }: TransformArgs): TransformResult => {
    const before = text.slice(0, selectionStart);
    const after = text.slice(selectionEnd);
    const selected = text.slice(selectionStart, selectionEnd);
    const content =
      selected.replace(/^#{1,6}\s*/, "").trim() || "Heading";
    const prefix = `${"#".repeat(level)} `;
    const needsLeading =
      selectionStart === 0 || before.endsWith("\n") ? "" : "\n\n";
    const needsTrailing =
      selectionEnd === text.length || after.startsWith("\n") ? "" : "\n\n";
    const insertion = `${needsLeading}${prefix}${content}${needsTrailing}`;
    const value = `${before}${insertion}${after}`;
    const start =
      before.length + needsLeading.length + prefix.length;
    const end = start + content.length;
    return { value, selectionStart: start, selectionEnd: end };
  };

const codeTransform = ({
  text,
  selectionStart,
  selectionEnd,
}: TransformArgs): TransformResult => {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const selected = text.slice(selectionStart, selectionEnd);
  const content = selected.length > 0 ? selected : "code snippet";
  const isMultiLine = content.includes("\n");

  if (isMultiLine || !selected.length) {
    const prefix = before.endsWith("\n") ? "\n" : "\n\n";
    const suffix = after.startsWith("\n") ? "\n" : "\n\n";
    const block = `${prefix}\`\`\`\n${content}\n\`\`\`${suffix}`;
    const value = `${before}${block}${after}`;
    const start =
      before.length + prefix.length + 4; // \n + ```
    const end = start + content.length;
    return { value, selectionStart: start, selectionEnd: end };
  }

  const inline = `\`${content}\``;
  const value = `${before}${inline}${after}`;
  const start = selectionStart + 1;
  const end = start + content.length;
  return { value, selectionStart: start, selectionEnd: end };
};

const dividerTransform = ({
  text,
  selectionStart,
  selectionEnd,
}: TransformArgs): TransformResult => {
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const prefix = before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.startsWith("\n") ? "\n" : "\n\n";
  const insertion = `${prefix}---${suffix}`;
  const value = `${before}${insertion}${after}`;
  const cursor = before.length + insertion.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
};

const formattingActions: FormattingAction[] = [
  {
    id: "bold",
    label: "Bold",
    hint: "Bold (⌘/Ctrl + B)",
    transform: wrapSelection("**", "**", "bold text"),
  },
  {
    id: "italic",
    label: "Italic",
    hint: "Italic (⌘/Ctrl + I)",
    transform: wrapSelection("_", "_", "emphasis"),
  },
  {
    id: "heading",
    label: "Heading",
    hint: "Level 2 heading (⌘/Ctrl + 2)",
    transform: headingTransform(2),
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Blockquote",
    transform: prefixLines("> ", "Quote text"),
  },
  {
    id: "code",
    label: "Code",
    hint: "Inline or fenced code (⌘/Ctrl + E)",
    transform: codeTransform,
  },
  {
    id: "todo",
    label: "Todo",
    hint: "Checklist item",
    transform: prefixLines("- [ ] ", "Task detail"),
  },
  {
    id: "divider",
    label: "Divider",
    hint: "Horizontal rule",
    transform: dividerTransform,
  },
];

export function MarkdownEditor() {
  const [draft, setDraft] = useState<string>(STARTER_TEMPLATE);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const nextSelection = useRef<[number, number] | null>(null);
  const hydrated = useRef(false);
  const skipInitialSave = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setDraft(stored);
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current || typeof window === "undefined") return;
    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      return;
    }
    setSaveState("saving");
    window.localStorage.setItem(STORAGE_KEY, draft);
    const timer = window.setTimeout(() => setSaveState("saved"), 420);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selection = nextSelection.current;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
    if (!selection) return;
    const [start, end] = selection;
    textarea.setSelectionRange(start, end);
    textarea.focus();
    nextSelection.current = null;
  }, [draft]);

  const stats = useMemo(() => {
    const trimmed = draft.trim();
    const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
    const charCount = draft.length;
    const lineCount = draft.split(/\r?\n/).length;
    return { wordCount, charCount, lineCount };
  }, [draft]);

  const applyAction = useCallback(
    (action: FormattingAction) => {
      const textarea = textareaRef.current;
      const fallbackPosition = draft.length;
      const selectionStart =
        textarea?.selectionStart ?? fallbackPosition;
      const selectionEnd = textarea?.selectionEnd ?? fallbackPosition;

      setDraft((prev) => {
        const result = action.transform({
          text: prev,
          selectionStart,
          selectionEnd,
        });
        nextSelection.current = [
          result.selectionStart,
          result.selectionEnd,
        ];
        return result.value;
      });
    },
    [draft],
  );

  const runAction = useCallback(
    (id: string) => {
      const action = formattingActions.find((item) => item.id === id);
      if (action) {
        applyAction(action);
      }
    },
    [applyAction],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Tab") {
        event.preventDefault();
        const textarea = textareaRef.current;
        const position = textarea?.selectionStart ?? draft.length;
        setDraft((prev) => {
          const value = `${prev.slice(0, position)}  ${prev.slice(position)}`;
          const nextPos = position + 2;
          nextSelection.current = [nextPos, nextPos];
          return value;
        });
        return;
      }

      const isShortcut = event.metaKey || event.ctrlKey;
      if (!isShortcut) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        runAction("bold");
      } else if (key === "i") {
        event.preventDefault();
        runAction("italic");
      } else if (key === "e") {
        event.preventDefault();
        runAction("code");
      } else if (key === "2") {
        event.preventDefault();
        runAction("heading");
      }
    },
    [draft, runAction],
  );

  const handleCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [draft]);

  const handleClear = useCallback(() => {
    setDraft("");
    nextSelection.current = [0, 0];
  }, []);

  const handleReset = useCallback(() => {
    if (draft === STARTER_TEMPLATE) return;
    const shouldReset =
      typeof window === "undefined"
        ? true
        : window.confirm("Reset to the starter template? This will overwrite your current note.");
    if (!shouldReset) return;
    setDraft(STARTER_TEMPLATE);
    nextSelection.current = [0, STARTER_TEMPLATE.length];
  }, [draft]);

  return (
    <section className={styles.editorShell} aria-label="Markdown editor workspace">
      <div className={styles.toolbar}>
        <div className={styles.actionGroup}>
          {formattingActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={styles.button}
              onClick={() => applyAction(action)}
              title={action.hint}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className={styles.toolbarTail}>
          <div className={styles.meta}>
            <span>{stats.wordCount} words</span>
            <span>{stats.charCount} chars</span>
            <span>{stats.lineCount} lines</span>
            <span
              className={styles.status}
              data-state={saveState}
            >
              {saveState === "saving" ? "Syncing" : "Synced"}
            </span>
          </div>
          <div className={styles.pillGroup}>
            <button
              type="button"
              className={clsx(
                styles.button,
                styles.secondary,
                copied && styles.copied,
              )}
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              type="button"
              className={clsx(styles.button, styles.secondary)}
              onClick={handleClear}
              title="Clear editor"
            >
              Clear
            </button>
            <button
              type="button"
              className={clsx(styles.button, styles.secondary, styles.danger)}
              onClick={handleReset}
              title="Reset to starter template"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
      <div className={styles.panes}>
        <div className={styles.pane}>
          <div className={styles.paneHeader}>Editor</div>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder="Start typing, add tasks, or paste links…"
            value={draft}
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Markdown input"
          />
        </div>
        <div className={styles.pane}>
          <div className={styles.paneHeader}>Preview</div>
          <div className={styles.preview}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {draft.trim().length
                ? draft
                : "_Nothing yet — start writing on the left._"}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </section>
  );
}
