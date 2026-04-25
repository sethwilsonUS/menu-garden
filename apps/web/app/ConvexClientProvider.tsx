"use client";

import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useCallback, useMemo, type ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL.");
}

if (!clerkPublishableKey) {
  throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.");
}

const convex = new ConvexReactClient(convexUrl);
const clerkKey = clerkPublishableKey;

function isMissingConvexTemplateError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("no jwt template exists with name: convex")
  );
}

function useConvexCompatibleAuth() {
  const auth = useAuth();
  const getToken = useCallback(
    async (options: Parameters<typeof auth.getToken>[0]) => {
      try {
        return await auth.getToken(options);
      } catch (error) {
        if (options?.template === "convex" && isMissingConvexTemplateError(error)) {
          return auth.getToken({ skipCache: options.skipCache });
        }

        throw error;
      }
    },
    [auth]
  );

  return useMemo(() => ({ ...auth, getToken }), [auth, getToken]);
}

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ClerkProvider publishableKey={clerkKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useConvexCompatibleAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
