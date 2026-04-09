import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Sora, Space_Grotesk } from 'next/font/google';
import './globals.css';

const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'GeoLearn AI',
  description: 'GIS learning platform for Nigerian students',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <ClerkProvider>
        <body
          className={`${sora.variable} ${spaceGrotesk.variable} antialiased`}
        >
          {children}
        </body>
      </ClerkProvider>
    </html>
  );
}
