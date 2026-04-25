import { useColorScheme } from "react-native";

const lightTheme = {
  background: "#f7f6f3",
  backgroundMuted: "#efede8",
  card: "#ffffff",
  border: "#d4d1c7",
  text: "#1a1a1a",
  textMuted: "#4b5441",
  accent: "#036b4a",
  accentPressed: "#065f46",
  pill: "rgba(4, 120, 87, 0.08)",
  critical: "#dc2626",
};

const darkTheme = {
  background: "#171717",
  backgroundMuted: "#1e1e1e",
  card: "#1f1f1f",
  border: "#2f2f2f",
  text: "#f0ede6",
  textMuted: "#a8b89e",
  accent: "#34d399",
  accentPressed: "#6ee7b7",
  pill: "rgba(52, 211, 153, 0.12)",
  critical: "#ef4444",
};

export function useAppTheme() {
  const colorScheme = useColorScheme();
  return colorScheme === "dark" ? darkTheme : lightTheme;
}
