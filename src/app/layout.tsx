import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import Script from "next/script"; // 1. Import Script

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ztools",
  description: "Ztoolx Built with TypeScript, Tailwind CSS, and shadcn/ui.",
  keywords: ["Zohaib", "Next.js", "TypeScript", "Tailwind CSS", "shadcn/ui", "AI development", "React"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://images.icon-icons.com/2429/PNG/512/amazon_logo_icon_147320.png",
  },
  openGraph: {
    title: "Ztoolx",
    description: "development with modern React stack",
    url: "",
    siteName: "Ztoolx",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "",
    description: "development with modern React stack",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* 2. Google Tag Script (External) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-MJSD1EWT1V"
          strategy="afterInteractive"
        />
        
        {/* 3. Google Tag Script (Inline Config) */}
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-MJSD1EWT1V');
          `}
        </Script>

        {children}
        <Toaster />
      </body>
    </html>
  );
}