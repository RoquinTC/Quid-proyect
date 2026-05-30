import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { QueryClientProvider } from "@/components/providers/query-provider";
import { AppearanceProvider } from "@/components/providers/appearance-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#059669",
};

export const metadata: Metadata = {
  title: "Quid - Todo converge aquí",
  description:
    "Gestión financiera, transporte, salud y despensa en una sola app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Quid",
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className="bg-background font-sans text-foreground antialiased"
      >
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            themes={["light", "dark", "oled"]}
            disableTransitionOnChange
          >
            <AppearanceProvider>
              <QueryClientProvider>
                {children}
                <Toaster
                  position="top-center"
                  richColors
                  closeButton
                  toastOptions={{
                    className: "rounded-xl",
                  }}
                />
              </QueryClientProvider>
            </AppearanceProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
