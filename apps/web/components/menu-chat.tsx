"use client";

import type { MenuItemSummary } from "@menu-garden/shared/types";
import { useChatSession, useMenu } from "@menu-garden/shared/hooks";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAnonymousClientId } from "@/lib/anonymous-client";
import { MessageForkIcon } from "./brand-mark";

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
      <aside className="garden-bed menu-paper space-y-2 px-4 py-4">
        <h2 className="font-display text-lg font-semibold">Related items</h2>
        <p className="text-sm leading-6 text-foreground-2">
          Matching menu items will appear here after an answer.
        </p>
      </aside>
    );
  }

  return (
    <aside className="garden-bed menu-paper space-y-3 px-4 py-4" aria-labelledby="related-items-heading">
      <h2 className="font-display text-lg font-semibold" id="related-items-heading">
        Related items
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
      return "Assistant is getting an answer.";
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
    messages,
  ]);
  const isChatBusy = isSessionLoading || isSending || isStreaming;
  const isQuestionDisabled = !anonymousClientId || isChatBusy;

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
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="space-y-4">
        <form
          aria-labelledby="menu-chat-heading"
          className="garden-bed menu-paper space-y-5 px-5 py-5 sm:px-6"
          onSubmit={handleSubmit}
        >
          <header className="space-y-2">
            <p className="accent-pill w-fit">
              <MessageForkIcon />
              {menu.restaurant.name}
            </p>
            <h2 className="font-display text-3xl font-semibold" id="menu-chat-heading">
              Ask about {menu.title}
            </h2>
          </header>

          {(chatError || validationError) && (
            <div
              className="alert-banner alert-error text-sm font-semibold"
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
              className="input-field min-h-40 leading-7"
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
              Ask about ingredients, prices, allergens, vegetarian options, or what looks
              easiest to order. Anonymous chats stay on this device and each question can
              be up to 2,000 characters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
            <p
              aria-live="polite"
              className="text-sm font-semibold text-foreground-2"
              role="status"
            >
              {statusMessage}
            </p>
          </div>
        </form>

        <section aria-labelledby="conversation-heading" className="space-y-3">
          <h2 className="sr-only" id="conversation-heading">
            Conversation
          </h2>
          {messages.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface-2 px-4 py-4 text-sm leading-6 text-foreground-2">
              No questions yet. The menu is ready when you are.
            </p>
          ) : (
            <ol aria-label="Conversation" className="space-y-3">
              {messages.map((message) => (
                <li className="garden-bed px-4 py-4" key={message.id}>
                  <p className="font-mono text-sm font-semibold text-muted">
                    {message.role === "user" ? "You" : "Assistant"}
                    {message.status === "streaming" ? " is answering" : ""}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-base leading-7">
                    {message.content || "Answer is starting."}
                  </p>
                  {message.status === "failed" ? (
                    <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-200">
                      {message.errorMessage ??
                        "The assistant could not answer this question."}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <RelatedItems items={relatedItems} />
    </section>
  );
}
