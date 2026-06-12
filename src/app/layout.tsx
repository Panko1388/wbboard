import "@fontsource-variable/inter/wght.css"; // настоящий Inter c кириллицей, self-hosted
import "./globals.css";
import { cookies } from "next/headers";

export const metadata = { title: "WBboard — аналитика Wildberries" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Андре выбрал «Стекло» (Apple Liquid Glass) — тема по умолчанию; «Гелий» доступен переключателем
  const theme = (await cookies()).get("wbboard_theme")?.value === "helium" ? "helium" : "glass";
  return (
    <html lang="ru" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
