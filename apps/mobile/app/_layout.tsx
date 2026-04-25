import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useCallback, useMemo, type ReactNode } from "react";

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://placeholder.convex.cloud"
);

const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "pk_test_placeholder";

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

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useConvexCompatibleAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: "#1a1a1a",
          headerStyle: { backgroundColor: "#f7f6f3" },
          contentStyle: { backgroundColor: "#f7f6f3" },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="menu/[id]" options={{ title: "Menu Detail" }} />
        <Stack.Screen name="chat/[id]" options={{ title: "Menu Chat" }} />
      </Stack>
    </AppProviders>
  );
}
