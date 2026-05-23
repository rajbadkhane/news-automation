import { Cormorant_Garamond, Space_Grotesk } from "next/font/google";
import SiteFooter from "@/components/site-footer";
import "./globals.css";

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
  title: "Gautam Tech Studio Newsroom",
  description: "Professional live dashboard for Gautam Tech Studio news automation.",
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
