import { useChatSession } from "@menu-garden/shared/hooks";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ScreenShell } from "../../src/components/screen-shell";
import { useAppTheme } from "../../src/lib/theme";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const menuId = Array.isArray(id) ? id[0] : id;
  const theme = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const {
    messages,
    sendMessage,
    latestRelatedItemIds,
    isLoading,
    isSending,
    isStreaming,
    error,
  } = useChatSession(menuId);

  const statusMessage = useMemo(() => {
    if (isLoading) {
      return "Chat is getting ready.";
    }

    if (isSending) {
      return "Sending your question.";
    }

    if (isStreaming) {
      return "Assistant is getting an answer.";
    }

    if (messages.some((message) => message.role === "assistant")) {
      return "Assistant answer is complete.";
    }

    return "Chat is ready.";
  }, [isLoading, isSending, isStreaming, messages]);

  async function handleSend() {
    const question = draft.trim();

    if (!question) {
      setValidationError("Ask a menu question before sending.");
      inputRef.current?.focus();
      return;
    }

    setValidationError(null);

    try {
      await sendMessage(question);
      setDraft("");
    } catch {
      // The hook exposes the user-facing error. Keep the draft available.
    } finally {
      inputRef.current?.focus();
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Menu Chat" }} />
      <ScreenShell
        description="Ask menu-specific questions about ingredients, allergens, dietary tags, or prices."
        eyebrow="Menu chat"
        title="Ask a menu question"
      >
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="text"
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            padding: 18,
            gap: 10,
          }}
        >
          <Text selectable style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>
            Status
          </Text>
          <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
            {statusMessage}
          </Text>
        </View>

        {(validationError || error) ? (
          <View
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.critical,
              backgroundColor: theme.card,
              padding: 18,
            }}
          >
            <Text selectable style={{ color: theme.critical, fontSize: 15, fontWeight: "700" }}>
              {validationError ?? error}
            </Text>
          </View>
        ) : null}

        <View
          accessibilityLabel="Conversation"
          style={{
            borderRadius: 24,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.card,
            padding: 18,
            gap: 14,
          }}
        >
          <Text
            selectable
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}
          >
            Conversation
          </Text>
          {messages.length === 0 ? (
            <Text selectable style={{ color: theme.textMuted, fontSize: 15, lineHeight: 22 }}>
              No questions yet. Ask about ingredients, allergens, dietary tags, or prices.
            </Text>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.backgroundMuted,
                  padding: 14,
                  gap: 8,
                }}
              >
                <Text selectable style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>
                  {message.role === "user" ? "You" : "Assistant"}
                  {message.status === "streaming" ? " is answering" : ""}
                </Text>
                <Text selectable style={{ color: theme.text, fontSize: 16, lineHeight: 24 }}>
                  {message.content || "Answer is starting."}
                </Text>
                {message.status === "failed" ? (
                  <Text
                    selectable
                    style={{ color: theme.critical, fontSize: 14, fontWeight: "700" }}
                  >
                    {message.errorMessage ?? "The assistant could not answer this question."}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={{ gap: 10 }}>
          <Text selectable style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>
            Ask a menu question
          </Text>
          <TextInput
            accessibilityLabel="Ask a menu question"
            accessibilityHint="Ask about ingredients, allergens, dietary options, spice, or prices."
            editable={!isLoading && !isSending && !isStreaming}
            maxLength={2000}
            multiline
            onChangeText={(text) => {
              setDraft(text);
              if (validationError) {
                setValidationError(null);
              }
            }}
            placeholder="Example: What are the low carb options?"
            placeholderTextColor={theme.textMuted}
            ref={inputRef}
            style={{
              minHeight: 120,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.backgroundMuted,
              color: theme.text,
              padding: 16,
              textAlignVertical: "top",
            }}
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isLoading || isSending || isStreaming }}
            disabled={isLoading || isSending || isStreaming}
            onPress={handleSend}
            style={({ pressed }) => ({
              minHeight: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              backgroundColor: pressed ? theme.accentPressed : theme.accent,
              opacity: isLoading || isSending || isStreaming ? 0.55 : 1,
              paddingHorizontal: 18,
            })}
          >
            <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>
              Send question
            </Text>
          </Pressable>
          {latestRelatedItemIds.length > 0 ? (
            <Text selectable style={{ color: theme.textMuted, fontSize: 14, lineHeight: 21 }}>
              {latestRelatedItemIds.length} related menu item
              {latestRelatedItemIds.length === 1 ? "" : "s"} found for the latest answer.
            </Text>
          ) : null}
        </View>
      </ScreenShell>
    </>
  );
}
