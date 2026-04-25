import type { AnonymousChatJobSummary, ChatMessageSummary } from "../types";
import { useMutation, useQuery } from "convex/react";
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
  chatProgress: AnonymousChatJobSummary | null;
  failedQuestion: string | null;
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
  const [activeJobId, setActiveJobId] = useState<Id<"anonymousChatJobs"> | null>(
    null
  );
  const [activeAssistantMessageId, setActiveAssistantMessageId] = useState<
    string | null
  >(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const [localProgress, setLocalProgress] =
    useState<AnonymousChatJobSummary | null>(null);
  const startAnonymousChatJob = useMutation(api.chat.startAnonymousChatJob);
  const chatJob = useQuery(
    api.chat.getAnonymousChatJob,
    activeJobId
      ? {
          jobId: activeJobId,
          anonymousClientId: anonymousClientId ?? undefined,
        }
      : "skip"
  ) as AnonymousChatJobSummary | null | undefined;

  useEffect(() => {
    setMessages([]);
    setError(null);
    setIsSending(false);
    setActiveJobId(null);
    setActiveAssistantMessageId(null);
    setActiveQuestion(null);
    setFailedQuestion(null);
    setLocalProgress(null);
  }, [menuId]);

  useEffect(() => {
    if (!chatJob || !activeAssistantMessageId) {
      return;
    }

    setLocalProgress(chatJob);

    if (chatJob.status === "complete") {
      setMessages((current) =>
        current.map((message) =>
          message.id === activeAssistantMessageId
            ? {
                ...message,
                content: chatJob.answer ?? "",
                status: "complete",
                referencedItemIds: chatJob.referencedItemIds,
                updatedAt: chatJob.updatedAt,
              }
            : message
        )
      );
      setActiveJobId(null);
      setActiveAssistantMessageId(null);
      setActiveQuestion(null);
      setLocalProgress(null);
      return;
    }

    if (chatJob.status === "failed") {
      const message =
        chatJob.errorMessage ?? "The assistant could not answer this question.";

      setError(message);
      setFailedQuestion(activeQuestion);
      setMessages((current) =>
        current.map((chatMessage) =>
          chatMessage.id === activeAssistantMessageId
            ? {
                ...chatMessage,
                status: "failed",
                errorMessage: message,
                updatedAt: chatJob.updatedAt,
              }
            : chatMessage
        )
      );
      setActiveJobId(null);
      setActiveAssistantMessageId(null);
      setActiveQuestion(null);
      setLocalProgress(null);
    }
  }, [activeAssistantMessageId, activeQuestion, chatJob]);

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
      setFailedQuestion(null);
      setIsSending(true);
      setLocalProgress({
        id: assistantMessageId,
        status: "queued",
        message: "Question received.",
        step: 1,
        totalSteps: 4,
        referencedItemIds: [],
        updatedAt: now,
      });
      setMessages((current) => [...current, userMessage, assistantMessage]);

      try {
        const result = await startAnonymousChatJob({
          menuId: menuId as Id<"menus">,
          question: trimmedContent,
          anonymousClientId: anonymousClientId ?? undefined,
          history,
        });

        setActiveJobId(result.jobId);
        setActiveAssistantMessageId(assistantMessageId);
        setActiveQuestion(trimmedContent);
      } catch (sendError) {
        const message =
          sendError instanceof Error ? sendError.message : "Message could not be sent.";
        const failedAt = Date.now();

        setError(message);
        setFailedQuestion(trimmedContent);
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
    [anonymousClientId, menuId, messages, startAnonymousChatJob]
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
    chatProgress: localProgress,
    failedQuestion,
  };
}
