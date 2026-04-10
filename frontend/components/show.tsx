'use client';

import { useAuth } from '@clerk/nextjs';

type ShowProps = {
  when: 'signed-in' | 'signed-out';
  children: React.ReactNode;
};

export function Show({ when, children }: ShowProps) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (when === 'signed-in') {
    return isSignedIn ? <>{children}</> : null;
  }

  return !isSignedIn ? <>{children}</> : null;
}
