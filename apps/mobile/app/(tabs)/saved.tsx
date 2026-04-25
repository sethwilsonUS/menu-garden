import { Link } from "expo-router";
import { Pressable, Text } from "react-native";
import { ScreenShell } from "../../src/components/screen-shell";
import { useAppTheme } from "../../src/lib/theme";

export default function SavedTab() {
  const theme = useAppTheme();

  return (
    <ScreenShell
      description="Offline caching is later work, but the saved-menus route is ready now so the information architecture stays stable."
      eyebrow="Saved"
      title="Saved menus get their own tab from day one."
    >
      <Link href="/menu/demo-menu" asChild>
        <Pressable
          accessibilityHint="Opens the saved menu detail placeholder."
          accessibilityLabel="Sample saved menu"
          accessibilityRole="button"
          style={({ pressed }) => ({
            minHeight: 96,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: pressed ? theme.pill : theme.card,
            padding: 18,
            gap: 8,
          })}
        >
          <Text selectable style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>
            Demo Bistro tasting menu
          </Text>
          <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
            Placeholder for locally cached menus and recently viewed history.
          </Text>
        </Pressable>
      </Link>
    </ScreenShell>
  );
}
