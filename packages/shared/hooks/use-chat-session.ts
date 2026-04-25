import type { ChatMessageSummary } from "../types";
import { useAction } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type UseChatSessionResult = {
  sessionId: string | null;
  messages: ChatMessageSummary[];
  sendMessage: (content: string) => Promise<void>;
  latestRelatedItemIds: string[];
  isStreaming: boolean;
  isSending: boolean;
  isLoading: boolean;
  error: string | null;
};

function createLocalMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useChatSession(
  menuId: string | null | undefined,
  anonymousClientId?: string | null
): UseChatSessionResult {
  const [messages, setMessages] = useState<ChatMessageSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const answerMenuQuestion = useAction(api.ai.answerMenuQuestionEphemeral);

  useEffect(() => {
    setMessages([]);
    setError(null);
    setIsSending(false);
  }, [menuId]);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmedContent = content.trim();

      if (!menuId) {
        throw new Error("Chat is still getting ready.");
      }

      if (!trimmedContent) {
        throw new Error("Ask a menu question before sending.");
      }

      const now = Date.now();
      const userMessage: ChatMessageSummary = {
        id: createLocalMessageId("user"),
        role: "user",
        content: trimmedContent,
        status: "complete",
        referencedItemIds: [],
        createdAt: now,
        updatedAt: now,
      };
      const assistantMessageId = createLocalMessageId("assistant");
      const assistantMessage: ChatMessageSummary = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        status: "streaming",
        referencedItemIds: [],
        createdAt: now + 1,
        updatedAt: now + 1,
      };
      const history = messages
        .filter((message) => message.content.trim().length > 0)
        .slice(-10)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      setError(null);
      setIsSending(true);
      setMessages((current) => [...current, userMessage, assistantMessage]);

      try {
        const result = await answerMenuQuestion({
          menuId: menuId as Id<"menus">,
          question: trimmedContent,
          anonymousClientId: anonymousClientId ?? undefined,
          history,
        });
        const completedAt = Date.now();

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: result.answer,
                  status: "complete",
                  referencedItemIds: result.referencedItemIds,
                  updatedAt: completedAt,
                }
              : message
          )
        );
      } catch (sendError) {
        const message =
          sendError instanceof Error ? sendError.message : "Message could not be sent.";
        const failedAt = Date.now();

        setError(message);
        setMessages((current) =>
          current.map((chatMessage) =>
            chatMessage.id === assistantMessageId
              ? {
                  ...chatMessage,
                  status: "failed",
                  errorMessage: message,
                  updatedAt: failedAt,
                }
              : chatMessage
          )
        );
        throw new Error(message);
      } finally {
        setIsSending(false);
      }
    },
    [anonymousClientId, answerMenuQuestion, menuId, messages]
  );

  const isStreaming = messages.some(
    (message) => message.role === "assistant" && message.status === "streaming"
  );
  const latestRelatedItemIds = useMemo(() => {
    const assistantMessages = [...messages]
      .reverse()
      .filter((message) => message.role === "assistant");
    const latestWithRelatedItems = assistantMessages.find(
      (message) => message.referencedItemIds.length > 0
    );

    return latestWithRelatedItems?.referencedItemIds ?? [];
  }, [messages]);

  return {
    sessionId: null,
    messages,
    sendMessage,
    latestRelatedItemIds,
    isStreaming,
    isSending,
    isLoading: false,
    error,
  };
}
