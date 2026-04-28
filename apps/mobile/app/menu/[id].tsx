import { Stack, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { useEffect, useMemo, useRef } from "react";
import * as Haptics from "expo-haptics";
import { useMenu } from "@menu-garden/shared/hooks/use-menu";
import type { MenuParseJobSummary } from "@menu-garden/shared/types";
import { ScreenShell } from "../../src/components/screen-shell";
import { useAppTheme } from "../../src/lib/theme";

const WAIT_REASSURANCE =
  "This can take a couple minutes for dense or multi-page menus. Keep this screen open while Menu Garden works.";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMobileParseProgress(parseJob: MenuParseJobSummary) {
  const totalUploads = parseJob.totalPages
    ? Math.max(1, Math.floor(parseJob.totalPages))
    : null;
  const completedUploads = totalUploads
    ? clamp(Math.floor(parseJob.completedPages ?? 0), 0, totalUploads)
    : 0;
  const currentUpload =
    totalUploads && parseJob.currentPage
      ? clamp(Math.floor(parseJob.currentPage), 1, totalUploads)
      : null;
  const uploadDetail =
    totalUploads && parseJob.status !== "ready" && parseJob.status !== "failed"
      ? `${completedUploads} of ${totalUploads} menu upload${
          totalUploads === 1 ? "" : "s"
        } read.`
      : null;

  if (parseJob.status === "ready") {
    return {
      detail: "The accessible menu is ready.",
      label: "Ready",
      percent: 100,
      reassurance: null,
      uploadDetail,
    };
  }

  if (parseJob.status === "failed") {
    return {
      detail: "Menu reading could not finish.",
      label: "Reading stopped",
      percent: 100,
      reassurance: null,
      uploadDetail,
    };
  }

  if (parseJob.status === "saving") {
    return {
      detail: "Building the accessible menu from the readable menu text.",
      label: "Building",
      percent: 92,
      reassurance: WAIT_REASSURANCE,
      uploadDetail,
    };
  }

  if (
    parseJob.status === "extracting" &&
    totalUploads &&
    completedUploads >= totalUploads
  ) {
    return {
      detail: "Organizing the readable text into categories and menu items.",
      label: "Structuring",
      percent: 84,
      reassurance: WAIT_REASSURANCE,
      uploadDetail,
    };
  }

  if (parseJob.status === "extracting") {
    const readPercent = totalUploads
      ? 34 +
        Math.round(
          ((completedUploads + (currentUpload ? 0.35 : 0)) / totalUploads) * 42
        )
      : 46;

    return {
      detail:
        totalUploads && currentUpload
          ? `Reading upload ${currentUpload} of ${totalUploads}.`
          : "Reading the menu with AI.",
      label: "Reading",
      percent: clamp(readPercent, 34, 78),
      reassurance: WAIT_REASSURANCE,
      uploadDetail,
    };
  }

  if (parseJob.status === "converting") {
    return {
      detail: totalUploads
        ? `Preparing ${totalUploads} menu upload${totalUploads === 1 ? "" : "s"} for AI reading.`
        : "Preparing the menu for AI reading.",
      label: "Preparing",
      percent: 22,
      reassurance: WAIT_REASSURANCE,
      uploadDetail,
    };
  }

  return {
    detail: "Starting the menu upload.",
    label: "Uploading",
    percent: 10,
    reassurance: WAIT_REASSURANCE,
    uploadDetail,
  };
}

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
  const parseProgress = menu?.parseJob
    ? getMobileParseProgress(menu.parseJob)
    : null;

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
            {parseProgress ? (
              <View style={{ gap: 8 }}>
                <Text
                  selectable
                  style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}
                >
                  {parseProgress.label}
                </Text>
                <View
                  accessibilityLabel="Approximate menu reading progress"
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    max: 100,
                    min: 0,
                    now: parseProgress.percent,
                    text: [
                      `${parseProgress.label}. ${parseProgress.detail}`,
                      parseProgress.uploadDetail,
                      parseProgress.reassurance,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  }}
                  style={{
                    height: 10,
                    overflow: "hidden",
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.card,
                  }}
                >
                  <View
                    style={{
                      width: `${parseProgress.percent}%`,
                      height: "100%",
                      borderRadius: 999,
                      backgroundColor: theme.accent,
                    }}
                  />
                </View>
                <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
                  {parseProgress.detail}
                </Text>
                {parseProgress.uploadDetail ? (
                  <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
                    {parseProgress.uploadDetail}
                  </Text>
                ) : null}
                {parseProgress.reassurance ? (
                  <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
                    {parseProgress.reassurance}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {menu.parseJob.errorMessage ? (
              <Text selectable style={{ color: theme.critical, fontSize: 15, lineHeight: 22 }}>
                {menu.parseJob.errorMessage}
              </Text>
            ) : null}
            {menu.parseJob.visualAssessment?.actionSteps.map((step) => (
              <Text
                key={step}
                selectable
                style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}
              >
                {`- ${step}`}
              </Text>
            ))}
          </View>
        ) : null}

        {menu?.parseJob?.visualAssessment?.status === "partial" ? (
          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.accent,
              backgroundColor: theme.pill,
              padding: 18,
              gap: 8,
            }}
          >
            <Text
              selectable
              accessibilityRole="header"
              style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}
            >
              Photo visibility note
            </Text>
            {menu.parseJob.visualAssessment.note ? (
              <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
                {menu.parseJob.visualAssessment.note}
              </Text>
            ) : null}
            {menu.parseJob.visualAssessment.actionSteps.map((step) => (
              <Text
                key={step}
                selectable
                style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}
              >
                {`- ${step}`}
              </Text>
            ))}
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
