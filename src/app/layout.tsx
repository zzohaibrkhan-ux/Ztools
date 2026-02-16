import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
    icon: "data:image/png;base64,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",
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
        {children}
        <Toaster />
      </body>
    </html>
  );
}
