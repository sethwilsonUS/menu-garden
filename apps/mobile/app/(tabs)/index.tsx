import type { NearbyRestaurantSummary } from "@menu-garden/shared/types";
import { useNearby } from "@menu-garden/shared/hooks";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ScreenShell } from "../../src/components/screen-shell";
import { useAppTheme } from "../../src/lib/theme";

const zipPattern = /^\d{5}$/;

function availabilityLabel(result: NearbyRestaurantSummary) {
  if (result.menuAvailability === "private") {
    return "Your uploaded menu is available";
  }

  if (result.menuAvailability === "public") {
    return "Accessible menu available";
  }

  return "No accessible menu yet";
}

export default function NearbyTab() {
  const theme = useAppTheme();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [zipCode, setZipCode] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data, results, search, hasSearched, isLoading, error } = useNearby();
  const statusMessage = useMemo(() => {
    if (isLoading) {
      return "Searching nearby restaurants.";
    }

    if (validationError || error) {
      return validationError ?? error;
    }

    if (data) {
      return data.message;
    }

    return "Enter a ZIP code to find nearby restaurants.";
  }, [data, error, isLoading, validationError]);

  async function handleSearch() {
    const trimmedZipCode = zipCode.trim();

    if (!zipPattern.test(trimmedZipCode)) {
      setValidationError("Enter a 5-digit U.S. ZIP code.");
      inputRef.current?.focus();
      return;
    }

    setValidationError(null);
    await search(trimmedZipCode);
  }

  function handleResultPress(result: NearbyRestaurantSummary) {
    if (result.actionTarget.type === "menu") {
      router.push(`/menu/${result.actionTarget.menuId}`);
      return;
    }

    router.push("/scan");
  }

  return (
    <ScreenShell
      description="Search by ZIP code, open accessible menus when they exist, or scan a menu when a restaurant still needs one."
      eyebrow="Nearby"
      title="Find an accessible menu nearby."
    >
      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.card,
          padding: 18,
          gap: 14,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
            ZIP code
          </Text>
          <TextInput
            accessibilityLabel="ZIP code"
            accessibilityHint="Enter a five digit U.S. ZIP code."
            autoComplete="postal-code"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={5}
            onChangeText={(value) => {
              setZipCode(value);
              if (validationError) {
                setValidationError(null);
              }
            }}
            placeholder="75701"
            placeholderTextColor={theme.textMuted}
            ref={inputRef}
            style={{
              minHeight: 48,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              color: theme.text,
              backgroundColor: theme.background,
              paddingHorizontal: 14,
              fontSize: 16,
            }}
            value={zipCode}
          />
        </View>

        <Pressable
          accessibilityLabel="Search nearby restaurants"
          accessibilityRole="button"
          accessibilityState={{ busy: isLoading, disabled: isLoading }}
          disabled={isLoading}
          onPress={handleSearch}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 18,
            backgroundColor: pressed ? theme.accentPressed : theme.accent,
            alignItems: "center",
            justifyContent: "center",
            opacity: isLoading ? 0.55 : 1,
            paddingHorizontal: 18,
          })}
        >
          <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>
            {isLoading ? "Searching" : "Search"}
          </Text>
        </Pressable>

        <View
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy: isLoading }}
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.backgroundMuted,
            padding: 14,
          }}
        >
          <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
            {statusMessage}
          </Text>
        </View>
      </View>

      {data?.status === "setup_required" ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            padding: 18,
            gap: 8,
          }}
        >
          <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
            Google discovery is not configured
          </Text>
          <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
            Add the Google Geocoding and Places keys to Convex dev env to search live
            Google results. Local Menu Garden results can still appear.
          </Text>
        </View>
      ) : null}

      {hasSearched && !isLoading && !results.length ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            padding: 18,
          }}
        >
          <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
            No restaurants found for this ZIP code yet.
          </Text>
        </View>
      ) : null}

      {results.map((result) => (
        <Pressable
          accessibilityHint={
            result.actionTarget.type === "menu"
              ? "Opens the accessible menu."
              : "Opens the scan tab so you can add a menu for this restaurant."
          }
          accessibilityLabel={`${result.name}. ${availabilityLabel(result)}.${
            result.formattedAddress ?? result.address
              ? ` ${result.formattedAddress ?? result.address}.`
              : ""
          }`}
          accessibilityRole="button"
          key={result.id ?? result.googlePlaceId ?? `${result.name}-${result.address}`}
          onPress={() => handleResultPress(result)}
          style={({ pressed }) => ({
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: pressed ? theme.pill : theme.card,
            padding: 18,
            gap: 8,
          })}
        >
          <Text selectable style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>
            {result.name}
          </Text>
          <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
            {availabilityLabel(result)}
          </Text>
          {result.formattedAddress ?? result.address ? (
            <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
              {result.formattedAddress ?? result.address}
            </Text>
          ) : null}
          <Text selectable style={{ color: theme.accent, fontSize: 15, fontWeight: "700" }}>
            {result.actionTarget.type === "menu" ? "Open menu" : "Scan or upload menu"}
          </Text>
        </Pressable>
      ))}
    </ScreenShell>
  );
}
