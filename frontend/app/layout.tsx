import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import { Sora, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: '--font-sora',
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GeoLearn AI",
  description: "GIS learning platform for Nigerian students",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-csp-nonce") ?? undefined;

  return (
    <html lang="en">
      <body className={`${sora.variable} ${spaceGrotesk.variable} antialiased`}>
        <ClerkProvider nonce={nonce}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
