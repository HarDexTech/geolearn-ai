import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
const scriptSrc = isDevelopment
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:"
  : "script-src 'self' 'unsafe-inline' https:";

function resolveBackendOrigin(url?: string): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const backendOrigin = resolveBackendOrigin(backendUrl);

const connectSources = ["'self'", "https:"];
if (backendOrigin) {
  connectSources.push(backendOrigin);
}
if (isDevelopment) {
  connectSources.push("http://127.0.0.1:8000", "http://localhost:8000");
}
const connectSrc = `connect-src ${Array.from(new Set(connectSources)).join(" ")}`;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: https:; ${connectSrc}; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
