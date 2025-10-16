import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quick Writer",
  description: "Lightweight markdown editor for fast note-taking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="app-body">
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
