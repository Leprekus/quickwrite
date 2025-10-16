import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <span className={styles.badge}>Quick Writer</span>
        <h1 className={styles.title}>
          Markdown scratchpad built for ship-speed notes.
        </h1>
        <p className={styles.description}>
          Capture thoughts the moment they hit, format with keyboard-first
          shortcuts, and watch the preview update instantly. Everything stays in
          your browser so you can close the tab and pick up where you left off.
        </p>
      </header>
      <MarkdownEditor />
      <footer className={styles.footer}>
        Pro tip: ⌘/Ctrl + B for bold, ⌘/Ctrl + I for italics, ⌘/Ctrl + 2 for
        headings.
      </footer>
    </main>
  );
}
