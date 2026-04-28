import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@menu-garden/shared/convex/_generated/api";
import type { Id } from "@menu-garden/shared/convex/_generated/dataModel";
import { ScreenShell } from "../../src/components/screen-shell";
import { useAppTheme } from "../../src/lib/theme";

export default function ScanTab() {
  const theme = useAppTheme();
  const router = useRouter();
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createMenuFromUpload = useMutation(api.menus.createMenuFromUpload);
  const [restaurantName, setRestaurantName] = useState("");
  const [menuTitle, setMenuTitle] = useState("");
  const [statusMessage, setStatusMessage] = useState("Choose how to add a menu photo.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function uploadImage(asset: ImagePicker.ImagePickerAsset) {
    const trimmedRestaurantName = restaurantName.trim();
    const trimmedMenuTitle = menuTitle.trim();

    if (!trimmedRestaurantName) {
      setErrorMessage("Enter the restaurant name before uploading.");
      return;
    }

    if (!trimmedMenuTitle) {
      setErrorMessage("Enter the menu title before uploading.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage("Preparing menu image upload.");

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const uploadUrl = await generateUploadUrl();
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();

      setStatusMessage("Uploading menu image.");
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": asset.mimeType ?? blob.type ?? "image/jpeg",
        },
        body: blob,
      });

      if (!uploadResponse.ok) {
        throw new Error("The menu image could not be uploaded.");
      }

      const { storageId } = (await uploadResponse.json()) as {
        storageId: Id<"_storage">;
      };

      setStatusMessage("Starting menu parsing.");
      const result = await createMenuFromUpload({
        storageId,
        restaurantName: trimmedRestaurantName,
        menuTitle: trimmedMenuTitle,
        sourceType: "image",
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatusMessage("Menu parsing started. Opening menu detail.");
      router.push(`/menu/${result.menuId}`);
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(error instanceof Error ? error.message : "Upload failed.");
      setStatusMessage("Upload failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage("Camera permission is needed to photograph a menu.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });

    if (!result.canceled) {
      await uploadImage(result.assets[0]);
    }
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });

    if (!result.canceled) {
      await uploadImage(result.assets[0]);
    }
  }

  return (
    <ScreenShell
      description="Photograph a physical menu or choose an existing menu photo, then Menu Garden will parse it into accessible categories and items."
      eyebrow="Scan"
      title="Scan a physical menu."
    >
      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.card,
          padding: 18,
          gap: 16,
        }}
      >
        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
            Restaurant name
          </Text>
          <TextInput
            accessibilityLabel="Restaurant name"
            accessibilityHint="Enter the restaurant name for this scanned menu."
            autoCapitalize="words"
            onChangeText={setRestaurantName}
            placeholder="Restaurant name"
            placeholderTextColor={theme.textMuted}
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
            value={restaurantName}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text selectable style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
            Menu title
          </Text>
          <TextInput
            accessibilityLabel="Menu title"
            accessibilityHint="Enter a short name for this menu."
            autoCapitalize="words"
            onChangeText={setMenuTitle}
            placeholder="Dinner menu"
            placeholderTextColor={theme.textMuted}
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
            value={menuTitle}
          />
        </View>

        <Pressable
          accessibilityHint="Opens the system camera to photograph a menu."
          accessibilityLabel="Take menu photo"
          accessibilityRole="button"
          accessibilityState={{ busy: isBusy, disabled: isBusy }}
          disabled={isBusy}
          onPress={takePhoto}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 18,
            backgroundColor: pressed ? theme.accentPressed : theme.accent,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 18,
          })}
        >
          <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>
            Take photo
          </Text>
        </Pressable>

        <Pressable
          accessibilityHint="Opens your photo library so you can choose an existing menu image."
          accessibilityLabel="Choose existing menu photo"
          accessibilityRole="button"
          accessibilityState={{ busy: isBusy, disabled: isBusy }}
          disabled={isBusy}
          onPress={choosePhoto}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: pressed ? theme.backgroundMuted : theme.background,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 18,
          })}
        >
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
            Choose existing photo
          </Text>
        </Pressable>

        <View
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy: isBusy }}
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.backgroundMuted,
            padding: 14,
            gap: 8,
          }}
        >
          <Text selectable style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>
            {statusMessage}
          </Text>
          {errorMessage ? (
            <Text selectable style={{ color: theme.critical, fontSize: 15, lineHeight: 22 }}>
              {errorMessage}
            </Text>
          ) : null}
        </View>
      </View>
    </ScreenShell>
  );
}
