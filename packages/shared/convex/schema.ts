import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  restaurants: defineTable({
    name: v.string(),
    slug: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    latitude: v.optional(v.float64()),
    longitude: v.optional(v.float64()),
    cuisineType: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    googlePlaceId: v.optional(v.string()),
    formattedAddress: v.optional(v.string()),
    lastGoogleSyncAt: v.optional(v.float64()),
    claimedByOwner: v.boolean(),
    ownerId: v.optional(v.string()),
    createdAt: v.float64(),
  })
    .index("by_slug", ["slug"])
    .index("by_zip", ["zipCode"])
    .index("by_owner", ["ownerId"])
    .index("by_google_place", ["googlePlaceId"])
    .searchIndex("search_name", { searchField: "name" }),

  menus: defineTable({
    restaurantId: v.id("restaurants"),
    title: v.string(),
    version: v.float64(),
    status: v.union(
      v.literal("processing"),
      v.literal("ready"),
      v.literal("published"),
      v.literal("archived")
    ),
    sourceFileId: v.optional(v.id("_storage")),
    uploadedByUserId: v.optional(v.string()),
    uploadedByAnonymousId: v.optional(v.string()),
    visibility: v.optional(
      v.union(v.literal("private"), v.literal("public"), v.literal("unlisted"))
    ),
    sourceType: v.union(
      v.literal("pdf"),
      v.literal("image"),
      v.literal("crawl"),
      v.literal("manual")
    ),
    processedAt: v.optional(v.float64()),
    publishedAt: v.optional(v.float64()),
    lastEditedAt: v.optional(v.float64()),
    createdAt: v.float64(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_status", ["status"]),

  menuUploadFingerprints: defineTable({
    orderedSignature: v.string(),
    sourceType: v.union(v.literal("pdf"), v.literal("image")),
    fileCount: v.float64(),
    menuId: v.id("menus"),
    createdAt: v.float64(),
  }).index("by_ordered_signature", ["orderedSignature"]),

  menuCategories: defineTable({
    menuId: v.id("menus"),
    name: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.float64(),
  }).index("by_menu", ["menuId"]),

  menuItems: defineTable({
    menuId: v.id("menus"),
    categoryId: v.id("menuCategories"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.optional(v.string()),
    allergens: v.optional(v.array(v.string())),
    dietaryTags: v.optional(v.array(v.string())),
    spiceLevel: v.optional(v.string()),
    isAvailable: v.boolean(),
    sortOrder: v.float64(),
  })
    .index("by_menu", ["menuId"])
    .index("by_category", ["categoryId"]),

  chatSessions: defineTable({
    menuId: v.id("menus"),
    userId: v.optional(v.string()),
    anonymousClientId: v.optional(v.string()),
    createdAt: v.float64(),
  })
    .index("by_menu", ["menuId"])
    .index("by_user", ["userId"])
    .index("by_user_menu", ["userId", "menuId"])
    .index("by_anonymous_menu", ["anonymousClientId", "menuId"]),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(v.literal("streaming"), v.literal("complete"), v.literal("failed"))
    ),
    errorMessage: v.optional(v.string()),
    referencedItemIds: v.optional(v.array(v.id("menuItems"))),
    createdAt: v.float64(),
    updatedAt: v.optional(v.float64()),
  }).index("by_session", ["sessionId"]),

  menuParseJobs: defineTable({
    menuId: v.id("menus"),
    status: v.union(
      v.literal("queued"),
      v.literal("converting"),
      v.literal("extracting"),
      v.literal("saving"),
      v.literal("ready"),
      v.literal("failed")
    ),
    message: v.string(),
    errorMessage: v.optional(v.string()),
    warnings: v.optional(v.array(v.string())),
    totalPages: v.optional(v.float64()),
    currentPage: v.optional(v.float64()),
    completedPages: v.optional(v.float64()),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  }).index("by_menu", ["menuId"]),
});
