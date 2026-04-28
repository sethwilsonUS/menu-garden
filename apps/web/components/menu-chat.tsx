"use client";

import type {
  AnonymousChatJobSummary,
  MenuItemSummary,
} from "@menu-garden/shared/types";
import { useChatSession, useMenu } from "@menu-garden/shared/hooks";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAnonymousClientId } from "@/lib/anonymous-client";
import { MessageForkIcon } from "./brand-mark";

const suggestedQuestions = [
  "What are the vegetarian options?",
  "Which dishes avoid common allergens?",
  "What looks easy to order?",
];

type MessageBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "ordered-list";
      items: string[];
    }
  | {
      type: "unordered-list";
      items: string[];
    };

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>;
    }

    return segment;
  });
}

function getMessageBlocks(content: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const paragraphLines: string[] = [];
  let activeList:
    | {
        type: "ordered-list" | "unordered-list";
        items: string[];
      }
    | null = null;

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join("\n"),
    });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!activeList) {
      return;
    }

    blocks.push(activeList);
    activeList = null;
  }

  for (const line of content.trim().split("\n")) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushParagraph();
      flushList();
      continue;
    }

    const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
    const unorderedMatch = trimmedLine.match(/^[-*]\s+(.+)$/);

    if (orderedMatch || unorderedMatch) {
      flushParagraph();
      const type = orderedMatch ? "ordered-list" : "unordered-list";
      const item = orderedMatch?.[1] ?? unorderedMatch?.[1] ?? "";

      if (!activeList || activeList.type !== type) {
        flushList();
        activeList = { type, items: [] };
      }

      activeList.items.push(item);
      continue;
    }

    flushList();
    paragraphLines.push(trimmedLine);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function MarkdownMessage({ content }: { content: string }) {
  const blocks = getMessageBlocks(content);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-3 text-base leading-7">
      {blocks.map((block, blockIndex) => {
        if (block.type === "ordered-list") {
          return (
            <ol className="list-decimal space-y-2 pl-5" key={`ol-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === "unordered-list") {
          return (
            <ul className="list-disc space-y-2 pl-5" key={`ul-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p className="whitespace-pre-line" key={`p-${blockIndex}`}>
            {renderInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
}

function itemAccessibilityLabel(item: MenuItemSummary) {
  const dietaryTags = item.dietaryTags ?? [];
  const allergens = item.allergens ?? [];
  const details = [
    item.price ? `Price: ${item.price}` : null,
    item.description,
    dietaryTags.length ? `Dietary tags: ${dietaryTags.join(", ")}` : null,
    allergens.length ? `Allergens: ${allergens.join(", ")}` : null,
    item.spiceLevel ? `Spice level: ${item.spiceLevel}` : null,
  ].filter(Boolean);

  return [item.name, ...details].join(". ");
}

function RelatedItems({ items }: { items: MenuItemSummary[] }) {
  if (items.length === 0) {
    return (
      <aside className="garden-bed menu-paper space-y-2 px-4 py-4 lg:sticky lg:top-20">
        <h2 className="font-display text-lg font-semibold">Menu highlights</h2>
        <p className="text-sm leading-6 text-foreground-2">
          Items connected to the latest answer will appear here.
        </p>
      </aside>
    );
  }

  return (
    <aside
      aria-labelledby="related-items-heading"
      className="garden-bed menu-paper space-y-3 px-4 py-4 lg:sticky lg:top-20"
    >
      <h2 className="font-display text-lg font-semibold" id="related-items-heading">
        Menu highlights
      </h2>
      <ul className="space-y-3">
        {items.map((item) => {
          const dietaryTags = item.dietaryTags ?? [];
          const allergens = item.allergens ?? [];

          return (
            <li
              aria-label={itemAccessibilityLabel(item)}
              className="rounded-xl border border-border bg-surface px-3 py-3"
              key={item.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-base font-semibold">{item.name}</h3>
                {item.price ? (
                  <span
                    aria-label={`Price: ${item.price}`}
                    className="font-mono text-sm font-semibold text-accent"
                  >
                    {item.price}
                  </span>
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-2 text-sm leading-6 text-foreground-2">
                  {item.description}
                </p>
              ) : null}
              {dietaryTags.length || allergens.length || item.spiceLevel ? (
                <ul aria-label="Dietary information" className="mt-3 flex flex-wrap gap-2">
                  {dietaryTags.map((tag) => (
                    <li className="tag" key={`${item.id}-diet-${tag}`}>
                      {tag}
                    </li>
                  ))}
                  {allergens.map((allergen) => (
                    <li className="tag" key={`${item.id}-allergen-${allergen}`}>
                      Contains {allergen}
                    </li>
                  ))}
                  {item.spiceLevel ? <li className="tag">Spice: {item.spiceLevel}</li> : null}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function ChatProgress({ progress }: { progress: AnonymousChatJobSummary | null }) {
  if (!progress || progress.status === "complete" || progress.status === "failed") {
    return null;
  }

  const totalSteps = Math.max(1, Math.floor(progress.totalSteps));
  const step = Math.min(totalSteps, Math.max(1, Math.floor(progress.step)));
  const progressText = `Step ${step} of ${totalSteps}: ${progress.message}`;

  return (
    <div className="min-w-[14rem] space-y-2" aria-live="polite" role="status">
      <div
        aria-label="Menu chat answer progress"
        aria-valuemax={totalSteps}
        aria-valuemin={1}
        aria-valuenow={step}
        aria-valuetext={progressText}
        className="h-3 overflow-hidden rounded-full border border-accent-border bg-surface-2"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${Math.round((step / totalSteps) * 100)}%` }}
        />
      </div>
      <p className="text-sm font-semibold leading-6 text-foreground-2">
        {progressText}
      </p>
    </div>
  );
}

export function MenuChat({ menuId }: { menuId: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const didAutoFocusRef = useRef(false);
  const [anonymousClientId, setAnonymousClientId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data: menu, isLoading: isMenuLoading, error: menuError } = useMenu(menuId);
  const {
    messages,
    sendMessage,
    latestRelatedItemIds,
    isStreaming,
    isSending,
    isLoading: isSessionLoading,
    error: chatError,
    chatProgress,
    failedQuestion,
  } = useChatSession(menu && anonymousClientId ? menu.id : null, anonymousClientId);

  useEffect(() => {
    setAnonymousClientId(getAnonymousClientId());
  }, []);

  useEffect(() => {
    if (didAutoFocusRef.current || !menu || !anonymousClientId || isSessionLoading) {
      return;
    }

    didAutoFocusRef.current = true;
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [anonymousClientId, isSessionLoading, menu]);

  useEffect(() => {
    if (!failedQuestion || draft.trim()) {
      return;
    }

    setDraft(failedQuestion);
  }, [draft, failedQuestion]);

  const relatedItems = useMemo(() => {
    if (!menu || latestRelatedItemIds.length === 0) {
      return [];
    }

    const relatedIds = new Set(latestRelatedItemIds);
    return menu.items.filter((item) => relatedIds.has(item.id));
  }, [latestRelatedItemIds, menu]);

  const statusMessage = useMemo(() => {
    if (!anonymousClientId || isMenuLoading || isSessionLoading) {
      return "Chat is getting the menu ready.";
    }

    if (isSending) {
      return "Sending your question.";
    }

    if (isStreaming) {
      return chatProgress?.message ?? "Assistant is getting an answer.";
    }

    if (messages.some((message) => message.role === "assistant")) {
      return "Assistant answer is complete.";
    }

    return "Chat is ready.";
  }, [
    anonymousClientId,
    isMenuLoading,
    isSending,
    isSessionLoading,
    isStreaming,
    chatProgress?.message,
    messages,
  ]);
  const isChatBusy = isSessionLoading || isSending || isStreaming;
  const isQuestionDisabled = !anonymousClientId || isChatBusy;

  function applySuggestedQuestion(question: string) {
    setDraft(question);
    setValidationError(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();

    if (!question) {
      setValidationError("Ask a menu question before sending.");
      textareaRef.current?.focus();
      return;
    }

    setValidationError(null);

    try {
      await sendMessage(question);
      setDraft("");
    } catch {
      // The shared hook exposes the user-facing error; keep the draft available.
    } finally {
      textareaRef.current?.focus();
    }
  }

  if (isMenuLoading) {
    return (
      <section aria-live="polite" className="garden-bed space-y-3 px-6 py-6" role="status">
        <div className="skeleton h-5 w-44" />
        <div className="skeleton h-4 w-full max-w-xl" />
      </section>
    );
  }

  if (!menu || menuError) {
    return (
      <section className="garden-bed menu-paper space-y-4 px-6 py-6" role="alert">
        <h2 className="font-display text-3xl font-semibold">Menu chat is unavailable</h2>
        <p className="text-base leading-7 text-foreground-2">
          {menuError ?? "This menu could not be found or you do not have access to it."}
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <form
        aria-labelledby="menu-chat-heading"
        className="garden-bed menu-paper flex min-h-[min(46rem,calc(100vh-8rem))] flex-col overflow-hidden"
        onSubmit={handleSubmit}
      >
        <header className="border-b border-border px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="accent-pill w-fit">
                <MessageForkIcon />
                {menu.restaurant.name}
              </p>
              <h2 className="font-display text-3xl font-semibold" id="menu-chat-heading">
                Ask about {menu.title}
              </h2>
            </div>
            <p
              aria-live="polite"
              className="rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground-2"
              role="status"
            >
              {statusMessage}
            </p>
          </div>
        </header>

        <section
          aria-labelledby="conversation-heading"
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
        >
          <h2 className="sr-only" id="conversation-heading">
            Conversation
          </h2>
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-80 max-w-2xl flex-col justify-center gap-5 text-center">
              <div className="space-y-2">
                <p className="font-display text-2xl font-semibold">
                  The menu is ready when you are.
                </p>
                <p className="text-sm leading-6 text-foreground-2">
                  Ask about ingredients, prices, allergens, dietary options, or
                  what looks easiest to order.
                </p>
              </div>
              <div
                aria-label="Suggested menu questions"
                className="flex flex-wrap justify-center gap-2"
              >
                {suggestedQuestions.map((question) => (
                  <button
                    className="button-secondary text-sm"
                    disabled={isQuestionDisabled}
                    key={question}
                    onClick={() => applySuggestedQuestion(question)}
                    type="button"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol aria-label="Conversation" className="mx-auto max-w-3xl space-y-4">
              {messages.map((message) => {
                const isUserMessage = message.role === "user";

                return (
                  <li
                    className={`flex ${isUserMessage ? "justify-end" : "justify-start"}`}
                    key={message.id}
                  >
                    <article
                      className={`max-w-[min(100%,42rem)] rounded-2xl border px-4 py-4 ${
                        isUserMessage
                          ? "border-accent-border bg-accent-bg"
                          : "border-border bg-surface"
                      }`}
                    >
                      <p className="font-mono text-sm font-semibold text-muted">
                        {isUserMessage ? "You" : "Assistant"}
                        {message.status === "streaming" ? " is answering" : ""}
                      </p>
                      {message.content ? (
                        <MarkdownMessage content={message.content} />
                      ) : (
                        <p className="mt-2 text-base leading-7">
                          {chatProgress?.message || "Answer is starting."}
                        </p>
                      )}
                      {message.status === "failed" ? (
                        <p className="mt-2 text-sm font-semibold text-critical">
                          {message.errorMessage ??
                            "The assistant could not answer this question."}
                        </p>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="border-t border-border bg-surface-2 px-4 py-4 sm:px-6">
          {(chatError || validationError) && (
            <div
              className="alert-banner alert-error mb-3 text-sm font-semibold"
              id="chat-error"
              role="alert"
            >
              {validationError ?? chatError}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-semibold" htmlFor="menu-question">
              Ask a menu question
            </label>
            <textarea
              aria-describedby={[
                "menu-question-help",
                validationError || chatError ? "chat-error" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-invalid={Boolean(validationError || chatError)}
              className="input-field min-h-28 resize-y leading-7"
              disabled={isQuestionDisabled}
              id="menu-question"
              maxLength={2000}
              onChange={(event) => {
                setDraft(event.target.value);
                if (validationError) {
                  setValidationError(null);
                }
              }}
              placeholder="Example: What are the low carb options?"
              ref={textareaRef}
              value={draft}
            />
            <p className="text-sm leading-6 text-foreground-2" id="menu-question-help">
              This chat is temporary. Each question can be up to 2,000 characters.
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="button-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isQuestionDisabled}
              type="submit"
            >
              Send question
            </button>
            <p className="text-sm text-foreground-2">
              {draft.length}/2000 characters
            </p>
            <ChatProgress progress={chatProgress} />
          </div>
        </div>
      </form>

      <RelatedItems items={relatedItems} />
    </section>
  );
}
