import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Run Notes — анализ ML-экспериментов",
  description:
    "Сравнение метрик, диагностика переобучения и AI-анализ ML-экспериментов через MCP.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
