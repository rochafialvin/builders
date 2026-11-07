import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { defaultShareImage, siteUrl } from "./content";
import { isOss, site } from "./lib/site";

/** The icon files in public/ for this build: `oss-favicon.svg` and so on for the open source site. */
const iconPrefix = isOss ? "oss-" : "";
import { LanguageProvider } from "./components/language-provider";
import { SiteBottomNav } from "./components/shell";
import { currentLocale } from "./lib/locale-server";
import { cookies } from "next/headers";
import { isTheme, THEME_COOKIE } from "./lib/theme";
import "./globals.css";

export const instant = false;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  // Lets the phone's bottom bar pad itself clear of the home indicator.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f0" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1915" },
  ],
};

// Each page sets its own title, description and canonical. The share metadata
// here is the fallback: pages with an opengraph-image file (profiles,
// projects) get their own card image, everything else shares the generated root card.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  return {
    metadataBase: new URL(siteUrl),
    title: { default: site.name, template: "%s" },
    openGraph: {
      siteName: site.name,
      type: "website",
      locale: locale === "id" ? "id_ID" : "en_US",
      images: [defaultShareImage],
    },
    twitter: { card: "summary_large_image", images: [defaultShareImage.url] },
    // The open source site's mark is a pull request; builders keeps its peak.
    icons: {
      icon: [
        { url: `/${iconPrefix}favicon.ico`, sizes: "32x32", type: "image/x-icon" },
        { url: `/${iconPrefix}favicon.svg`, type: "image/svg+xml" },
      ],
      shortcut: `/${iconPrefix}favicon.ico`,
      apple: `/${iconPrefix}apple-touch-icon.png`,
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await currentLocale();
  // A chosen theme is rendered on the server so the first paint is already
  // right; with none, globals.css follows the device.
  const chosen = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(chosen) ? chosen : undefined;

  return (
    <html lang={locale} data-theme={theme}>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <LanguageProvider locale={locale}>
          {children}
          {/* Here rather than in each page's header, so it stays put while
              pages change under it. */}
          <SiteBottomNav />
        </LanguageProvider>
      </body>
    </html>
  );
}
