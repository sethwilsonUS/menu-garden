import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type DatabaseReader,
} from "./_generated/server";
import { v } from "convex/values";

const messageStatusValidator = v.union(
  v.literal("streaming"),
  v.literal("complete"),
  v.literal("failed")
);

function cleanAnonymousClientId(anonymousClientId?: string) {
  const trimmed = anonymousClientId?.trim();

  return trimmed && trimmed.length <= 128 ? trimmed : undefined;
}

async function authorizeMenuAccess(
  db: DatabaseReader,
  menuId: Id<"menus">,
  args: {
    userId?: string;
    anonymousClientId?: string;
    allowUnlistedLink?: boolean;
  }
) {
  const menu = await db.get(menuId);

  if (!menu) {
    throw new Error("Menu not found.");
  }

  const restaurant = await db.get(menu.restaurantId);

  if (!restaurant) {
    throw new Error("Restaurant record not found.");
  }

  const visibility = menu.visibility ?? "public";
  const isUploader =
    Boolean(args.userId) && menu.uploadedByUserId === args.userId;
  const isAnonymousUploader =
    Boolean(args.anonymousClientId) &&
    menu.uploadedByAnonymousId === args.anonymousClientId;
  const isRestaurantOwner =
    Boolean(args.userId) && restaurant.ownerId === args.userId;
  const isPublic = visibility === "public";
  const isUnlistedLink = visibility === "unlisted" && args.allowUnlistedLink;

  if (
    !isPublic &&
    !isUnlistedLink &&
    !isUploader &&
    !isAnonymousUploader &&
    !isRestaurantOwner
  ) {
    throw new Error("You do not have access to this menu.");
  }

  return { menu, restaurant };
}

async function authorizeSession(
  db: DatabaseReader,
  sessionId: Id<"chatSessions">,
  args: {
    userId?: string;
    anonymousClientId?: string;
  }
) {
  const session = await db.get(sessionId);

  if (!session) {
    throw new Error("Chat session not found.");
  }

  const isSignedInSession =
    Boolean(args.userId) && session.userId === args.userId;
  const isAnonymousSession =
    Boolean(args.anonymousClientId) &&
    session.anonymousClientId === args.anonymousClientId;

  if (!isSignedInSession && !isAnonymousSession) {
    throw new Error("You do not have access to this chat session.");
  }

  await authorizeMenuAccess(db, session.menuId, {
    userId: args.userId,
    anonymousClientId: args.anonymousClientId,
    allowUnlistedLink: true,
  });

  return session;
}

function serializeMenuContext(args: {
  menuTitle: string;
  restaurantName: string;
  categories: Array<{
    id: Id<"menuCategories">;
    name: string;
    description?: string;
  }>;
  items: Array<{
    id: Id<"menuItems">;
    categoryId: Id<"menuCategories">;
    name: string;
    description?: string;
    price?: string;
    allergens?: string[];
    dietaryTags?: string[];
    spiceLevel?: string;
  }>;
}) {
  const lines = [
    `Restaurant: ${args.restaurantName}`,
    `Menu: ${args.menuTitle}`,
    "",
  ];

  for (const category of args.categories) {
    lines.push(`Category: ${category.name}`);

    if (category.description) {
      lines.push(`Category description: ${category.description}`);
    }

    const items = args.items.filter((item) => item.categoryId === category.id);

    for (const item of items) {
      const details = [
        item.price ? `price ${item.price}` : null,
        item.description ? `description ${item.description}` : null,
        item.allergens?.length ? `allergens ${item.allergens.join(", ")}` : null,
        item.dietaryTags?.length
          ? `dietary tags ${item.dietaryTags.join(", ")}`
          : null,
        item.spiceLevel ? `spice ${item.spiceLevel}` : null,
      ].filter(Boolean);

      lines.push(`- [${item.id}] ${item.name}${details.length ? `: ${details.join("; ")}` : ""}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

export const getOrCreateSession = mutation({
  args: {
    menuId: v.id("menus"),
    anonymousClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const anonymousClientId = cleanAnonymousClientId(args.anonymousClientId);

    if (!identity && !anonymousClientId) {
      throw new Error("Chat is not ready yet. Refresh the page and try again.");
    }

    await authorizeMenuAccess(ctx.db, args.menuId, {
      userId: identity?.subject,
      anonymousClientId,
      allowUnlistedLink: true,
    });

    const existingSession = identity
      ? await ctx.db
          .query("chatSessions")
          .withIndex("by_user_menu", (q) =>
            q.eq("userId", identity.subject).eq("menuId", args.menuId)
          )
          .first()
      : await ctx.db
          .query("chatSessions")
          .withIndex("by_anonymous_menu", (q) =>
            q.eq("anonymousClientId", anonymousClientId).eq("menuId", args.menuId)
          )
          .first();

    if (existingSession) {
      return { sessionId: existingSession._id };
    }

    const sessionId = await ctx.db.insert("chatSessions", {
      menuId: args.menuId,
      userId: identity?.subject,
      anonymousClientId: identity ? undefined : anonymousClientId,
      createdAt: Date.now(),
    });

    return { sessionId };
  },
});

export const listMessages = query({
  args: {
    sessionId: v.id("chatSessions"),
    anonymousClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const anonymousClientId = cleanAnonymousClientId(args.anonymousClientId);

    if (!identity && !anonymousClientId) {
      return [];
    }

    await authorizeSession(ctx.db, args.sessionId, {
      userId: identity?.subject,
      anonymousClientId,
    });

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return messages
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((message) => ({
        id: message._id,
        role: message.role,
        content: message.content,
        status: message.status ?? "complete",
        errorMessage: message.errorMessage,
        referencedItemIds: message.referencedItemIds ?? [],
        createdAt: message.createdAt,
        updatedAt: message.updatedAt ?? message.createdAt,
      }));
  },
});

export const sendMessage = mutation({
  args: {
    menuId: v.id("menus"),
    sessionId: v.id("chatSessions"),
    content: v.string(),
    anonymousClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const anonymousClientId = cleanAnonymousClientId(args.anonymousClientId);

    if (!identity && !anonymousClientId) {
      throw new Error("Chat is not ready yet. Refresh the page and try again.");
    }

    const session = await authorizeSession(ctx.db, args.sessionId, {
      userId: identity?.subject,
      anonymousClientId,
    });

    if (session.menuId !== args.menuId) {
      throw new Error("This chat session belongs to a different menu.");
    }

    const content = args.content.trim();

    if (!content) {
      throw new Error("Ask a menu question before sending.");
    }

    if (content.length > 2000) {
      throw new Error("Keep menu questions under 2,000 characters.");
    }

    const existingMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const activeAssistantMessage = existingMessages.find(
      (message) => message.role === "assistant" && message.status === "streaming"
    );

    if (activeAssistantMessage) {
      throw new Error("Wait for the current answer to finish before asking another question.");
    }

    const now = Date.now();
    const userMessageId = await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: "user",
      content,
      status: "complete",
      createdAt: now,
      updatedAt: now,
    });
    const assistantMessageId = await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: now + 1,
      updatedAt: now + 1,
    });

    await ctx.scheduler.runAfter(0, internal.ai.answerMenuQuestion, {
      menuId: args.menuId,
      sessionId: args.sessionId,
      userMessageId,
      assistantMessageId,
    });

    return { userMessageId, assistantMessageId };
  },
});

export const getMenuChatContext = internalQuery({
  args: {
    menuId: v.id("menus"),
    sessionId: v.id("chatSessions"),
    assistantMessageId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);

    if (!session || session.menuId !== args.menuId) {
      throw new Error("Chat session does not match this menu.");
    }

    const menu = await ctx.db.get(args.menuId);

    if (!menu) {
      throw new Error("Menu not found.");
    }

    const restaurant = await ctx.db.get(menu.restaurantId);

    if (!restaurant) {
      throw new Error("Restaurant record not found.");
    }

    const categories = (
      await ctx.db
        .query("menuCategories")
        .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
        .collect()
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const items = (
      await ctx.db
        .query("menuItems")
        .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
        .collect()
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const messages = (
      await ctx.db
        .query("chatMessages")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect()
    )
      .filter((message) => message._id !== args.assistantMessageId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-10)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
    const categorySummaries = categories.map((category) => ({
      id: category._id,
      name: category.name,
      description: category.description,
    }));
    const itemSummaries = items.map((item) => ({
      id: item._id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      allergens: item.allergens,
      dietaryTags: item.dietaryTags,
      spiceLevel: item.spiceLevel,
    }));

    return {
      menuTitle: menu.title,
      restaurantName: restaurant.name,
      menuContext: serializeMenuContext({
        menuTitle: menu.title,
        restaurantName: restaurant.name,
        categories: categorySummaries,
        items: itemSummaries,
      }),
      messages,
      items: itemSummaries.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        allergens: item.allergens ?? [],
        dietaryTags: item.dietaryTags ?? [],
        spiceLevel: item.spiceLevel,
      })),
    };
  },
});

export const getEphemeralMenuChatContext = internalQuery({
  args: {
    menuId: v.id("menus"),
    anonymousClientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const anonymousClientId = cleanAnonymousClientId(args.anonymousClientId);
    const { menu, restaurant } = await authorizeMenuAccess(ctx.db, args.menuId, {
      userId: identity?.subject,
      anonymousClientId,
      allowUnlistedLink: true,
    });
    const categories = (
      await ctx.db
        .query("menuCategories")
        .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
        .collect()
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const items = (
      await ctx.db
        .query("menuItems")
        .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
        .collect()
    ).sort((a, b) => a.sortOrder - b.sortOrder);
    const categorySummaries = categories.map((category) => ({
      id: category._id,
      name: category.name,
      description: category.description,
    }));
    const itemSummaries = items.map((item) => ({
      id: item._id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      allergens: item.allergens,
      dietaryTags: item.dietaryTags,
      spiceLevel: item.spiceLevel,
    }));

    return {
      menuTitle: menu.title,
      restaurantName: restaurant.name,
      menuContext: serializeMenuContext({
        menuTitle: menu.title,
        restaurantName: restaurant.name,
        categories: categorySummaries,
        items: itemSummaries,
      }),
      messages: [],
      items: itemSummaries.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        allergens: item.allergens ?? [],
        dietaryTags: item.dietaryTags ?? [],
        spiceLevel: item.spiceLevel,
      })),
    };
  },
});

export const updateAssistantMessage = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    content: v.optional(v.string()),
    status: messageStatusValidator,
    errorMessage: v.optional(v.string()),
    referencedItemIds: v.optional(v.array(v.id("menuItems"))),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);

    if (!message || message.role !== "assistant") {
      throw new Error("Assistant message not found.");
    }

    await ctx.db.patch(args.messageId, {
      ...(args.content === undefined ? {} : { content: args.content }),
      status: args.status,
      errorMessage: args.errorMessage,
      referencedItemIds: args.referencedItemIds,
      updatedAt: Date.now(),
    });
  },
});
