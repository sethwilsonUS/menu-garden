"use client";

const ANONYMOUS_CLIENT_KEY = "menu-garden-anonymous-client-id";

function createAnonymousClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getAnonymousClientId() {
  if (typeof window === "undefined") {
    return null;
  }

  const existingId = window.localStorage.getItem(ANONYMOUS_CLIENT_KEY);

  if (existingId) {
    return existingId;
  }

  const newId = createAnonymousClientId();
  window.localStorage.setItem(ANONYMOUS_CLIENT_KEY, newId);

  return newId;
}
