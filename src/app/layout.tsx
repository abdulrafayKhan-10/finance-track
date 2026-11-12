import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import { ServiceWorkerRegistration } from "@/components/app-shell/service-worker";
import "./globals.css";

// Self-hosted at build time: no request reaches Google from the browser.
// Public Sans for reading (clear tabular figures); Bricolage Grotesque for titles and headline amounts.
const body = Public_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Finance Track", template: "%s · Finance Track" },
  description: "Private personal finance and investment tracker.",
  robots: { index: false, follow: false },
  icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Finance", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#123c33" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1411" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          {children}
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
