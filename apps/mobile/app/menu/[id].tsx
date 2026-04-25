import { Stack, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { useEffect, useMemo, useRef } from "react";
import * as Haptics from "expo-haptics";
import { useMenu } from "@menu-garden/shared/hooks/use-menu";
import { ScreenShell } from "../../src/components/screen-shell";
import { useAppTheme } from "../../src/lib/theme";

export default function MenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useAppTheme();
  const { data: menu, error, isLoading } = useMenu(id);
  const lastStatusRef = useRef<string | null>(null);
  const itemsByCategory = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof menu>["items"]>();

    for (const item of menu?.items ?? []) {
      grouped.set(item.categoryId, [...(grouped.get(item.categoryId) ?? []), item]);
    }

    return grouped;
  }, [menu?.items]);

  useEffect(() => {
    const status = menu?.parseJob?.status;

    if (!status || lastStatusRef.current === status) {
      return;
    }

    lastStatusRef.current = status;

    if (status === "ready") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    if (status === "failed") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [menu?.parseJob?.status]);

  const screenTitle = menu ? `${menu.restaurant.name} menu` : `Menu ${id}`;

  return (
    <>
      <Stack.Screen options={{ title: screenTitle }} />
      <ScreenShell
        description={
          menu
            ? menu.title
            : "Menu Garden will announce parsing updates and show accessible categories when ready."
        }
        eyebrow="Menu detail"
        title={screenTitle}
      >
        {isLoading ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityState={{ busy: true }}
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.card,
              padding: 18,
            }}
          >
            <Text selectable style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}>
              Loading menu.
            </Text>
          </View>
        ) : null}

        {error ? (
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
            <Text selectable style={{ color: theme.critical, fontSize: 16, lineHeight: 24 }}>
              {error}
            </Text>
          </View>
        ) : null}

        {menu?.parseJob && menu.parseJob.status !== "ready" ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityState={{ busy: menu.parseJob.status !== "failed" }}
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.backgroundMuted,
              padding: 18,
              gap: 8,
            }}
          >
            <Text selectable style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
              {menu.parseJob.message}
            </Text>
            {menu.parseJob.errorMessage ? (
              <Text selectable style={{ color: theme.critical, fontSize: 15, lineHeight: 22 }}>
                {menu.parseJob.errorMessage}
              </Text>
            ) : null}
          </View>
        ) : null}

        {menu?.categories.map((category) => (
          <View
            key={category.id}
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.card,
              padding: 18,
              gap: 12,
            }}
          >
            <Text
              selectable
              accessibilityRole="header"
              style={{ color: theme.text, fontSize: 22, fontWeight: "700" }}
            >
              {category.name}
            </Text>
            {category.description ? (
              <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
                {category.description}
              </Text>
            ) : null}
            {(itemsByCategory.get(category.id) ?? []).map((item) => {
              const details = [
                item.price ? `Price ${item.price}` : null,
                item.dietaryTags?.length ? `Dietary tags ${item.dietaryTags.join(", ")}` : null,
                item.allergens?.length ? `Allergens ${item.allergens.join(", ")}` : null,
                item.spiceLevel ? `Spice level ${item.spiceLevel}` : null,
              ].filter(Boolean);

              return (
                <View
                  accessible
                  accessibilityLabel={`${item.name}. ${details.join(". ")}${
                    item.description ? `. ${item.description}` : ""
                  }`}
                  key={item.id}
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                    paddingTop: 12,
                    gap: 6,
                  }}
                >
                  <Text selectable style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>
                    {item.name}
                    {item.price ? `, ${item.price}` : ""}
                  </Text>
                  {item.description ? (
                    <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
                      {item.description}
                    </Text>
                  ) : null}
                  {details.length ? (
                    <Text selectable style={{ color: theme.textMuted, fontSize: 14, lineHeight: 21 }}>
                      {details.join(". ")}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}

        {menu && menu.categories.length === 0 ? (
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
            <Text
              selectable
              style={{ color: theme.textMuted, fontSize: 16, lineHeight: 24 }}
            >
              Parsed menu items will appear here when processing finishes.
            </Text>
          </View>
        ) : null}
      </ScreenShell>
    </>
  );
}
