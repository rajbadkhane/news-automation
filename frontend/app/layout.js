import { Cormorant_Garamond, Space_Grotesk } from "next/font/google";
import SiteFooter from "@/components/site-footer";
import "./globals.css";

const siteUrl = "https://news.gautamenterprises.org";

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
});

export const metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "GEN-H News Agency",
  title: {
    default: "GEN-H News Agency | Gautam Enterprises",
    template: "%s | GEN-H News Agency",
  },
  description:
    "GEN-H by Gautam Enterprises is a fast, accurate, impartial and global AI-powered news agency founded by Rajanchal Tripathi.",
  keywords: [
    "GEN-H",
    "Gautam Enterprises",
    "Gautam Tech Studio",
    "Rajanchal Tripathi",
    "Rajanchal Tripathi founder",
    "news agency",
    "AI news agency",
    "Hindi news agency",
    "news automation",
  ],
  authors: [{ name: "Gautam Enterprises" }],
  creator: "Gautam Enterprises",
  publisher: "Gautam Enterprises",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "GEN-H News Agency",
    title: "GEN-H News Agency | Gautam Enterprises",
    description:
      "Fast, accurate, impartial and global AI-powered news agency founded by Rajanchal Tripathi.",
    images: [
      {
        url: "/images/logo.png",
        width: 512,
        height: 512,
        alt: "Gautam Enterprises GEN-H logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GEN-H News Agency | Gautam Enterprises",
    description:
      "Fast, accurate, impartial and global AI-powered news agency founded by Rajanchal Tripathi.",
    images: ["/images/logo.png"],
  },
  icons: {
    icon: "/images/logo.png",
    shortcut: "/images/logo.png",
    apple: "/images/logo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} bg-stone-950 text-white antialiased`}>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
