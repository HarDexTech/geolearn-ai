import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

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

function buildCsp(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const backendOrigin = resolveBackendOrigin(process.env.NEXT_PUBLIC_BACKEND_URL);
  const connectSources = ["'self'", "https:"];

  if (backendOrigin) {
    connectSources.push(backendOrigin);
  }
  if (isDevelopment) {
    connectSources.push("http://127.0.0.1:8000", "http://localhost:8000");
  }

  const scriptSources = isDevelopment
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https:`
    : `script-src 'self' 'nonce-${nonce}' https:`;
  const connectSrc = `connect-src ${Array.from(new Set(connectSources)).join(" ")}`;

  return [
    "default-src 'self'",
    scriptSources,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    connectSrc,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
