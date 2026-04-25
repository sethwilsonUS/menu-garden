import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { useAppTheme } from "../lib/theme";

export function ScreenShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const theme = useAppTheme();

  return (
    <ScrollView
      contentContainerStyle={{
        gap: 16,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 32,
      }}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <View
        accessible
        style={{
          borderRadius: 28,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.backgroundMuted,
          padding: 20,
          gap: 10,
        }}
      >
        <Text
          selectable
          style={{
            color: theme.textMuted,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Text>
        <Text
          selectable
          accessibilityRole="header"
          style={{ color: theme.text, fontSize: 32, fontWeight: "700", lineHeight: 38 }}
        >
          {title}
        </Text>
        <Text selectable style={{ color: theme.textMuted, fontSize: 16, lineHeight: 24 }}>
          {description}
        </Text>
      </View>
      {children}
    </ScrollView>
  );
}
