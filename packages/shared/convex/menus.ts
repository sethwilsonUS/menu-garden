import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";

const sourceTypeValidator = v.union(v.literal("pdf"), v.literal("image"));
const googleRestaurantValidator = {
  googlePlaceId: v.optional(v.string()),
  formattedAddress: v.optional(v.string()),
  latitude: v.optional(v.float64()),
  longitude: v.optional(v.float64()),
  zipCode: v.optional(v.string()),
  cuisineType: v.optional(v.string()),
};

const parseStatusValidator = v.union(
  v.literal("queued"),
  v.literal("converting"),
  v.literal("extracting"),
  v.literal("saving"),
  v.literal("ready"),
  v.literal("failed")
);

const parsedMenuValidator = v.object({
  warnings: v.array(v.string()),
  categories: v.array(
    v.object({
      name: v.string(),
      description: v.union(v.string(), v.null()),
      items: v.array(
        v.object({
          name: v.string(),
          description: v.union(v.string(), v.null()),
          price: v.union(v.string(), v.null()),
          allergens: v.array(v.string()),
          dietaryTags: v.array(v.string()),
          spiceLevel: v.union(v.string(), v.null()),
        })
      ),
    })
  ),
});

const MAX_UPLOAD_FILES = 8;
const anonymousClientIdValidator = v.optional(v.string());
const uploadFileHashesValidator = v.array(v.string());
const sha256HexPattern = /^[a-f0-9]{64}$/;
const DEFAULT_UPLOAD_NAME = "Uploaded menu";
const SAMPLE_RESTAURANT_NAME = "Menu Garden Sample Cafe";
const SAMPLE_RESTAURANT_SLUG = "menu-garden-sample-cafe";
const SAMPLE_MENU_TITLE = "Sample Accessible Menu";

type ParsedMenuForStorage = {
  warnings: string[];
  categories: {
    name: string;
    description: string | null;
    items: {
      name: string;
      description: string | null;
      price: string | null;
      allergens: string[];
      dietaryTags: string[];
      spiceLevel: string | null;
    }[];
  }[];
};

const sampleMenuFixture = {
  warnings: [],
  categories: [
    {
      name: "Breakfast",
      description: "Morning plates with simple substitutions called out.",
      items: [
        {
          name: "Garden Breakfast Plate",
          description:
            "Two eggs any style with herb potatoes, toast, and a choice of bacon, chicken sausage, or avocado.",
          price: "$12.50",
          allergens: ["egg", "wheat", "milk"],
          dietaryTags: ["vegetarian option"],
          spiceLevel: null,
        },
        {
          name: "Maple Berry Oatmeal",
          description:
            "Steel-cut oats with blueberries, toasted almonds, maple syrup, and oat milk. Ask for no almonds for a nut-free bowl.",
          price: "$8.75",
          allergens: ["tree nuts"],
          dietaryTags: ["vegan option", "dairy-free"],
          spiceLevel: null,
        },
      ],
    },
    {
      name: "Sandwiches and Bowls",
      description: "Lunch items with combo, size, and modifier details.",
      items: [
        {
          name: "Counter Burger Combo",
          description:
            "Beef patty, lettuce, tomato, pickles, and garden sauce on a brioche bun. Combo includes fries and a fountain drink. Add cheese for $1 or swap a gluten-free bun for $1.50.",
          price: "$14.00",
          allergens: ["egg", "milk", "wheat"],
          dietaryTags: [],
          spiceLevel: null,
        },
        {
          name: "Lemon Herb Chicken Rice Bowl",
          description:
            "Grilled chicken over brown rice with cucumbers, tomatoes, greens, and lemon yogurt sauce. Make it dairy-free with vinaigrette.",
          price: "$13.25",
          allergens: ["milk"],
          dietaryTags: ["gluten-free option"],
          spiceLevel: null,
        },
        {
          name: "Kale Caesar Wrap",
          description:
            "Kale, romaine, parmesan, chickpea crisps, and Caesar dressing in a spinach tortilla. Add grilled chicken for $4.",
          price: "$10.75",
          allergens: ["fish", "milk", "wheat"],
          dietaryTags: ["vegetarian"],
          spiceLevel: null,
        },
      ],
    },
    {
      name: "Drinks",
      description: "Cold drinks with sizes listed in the item text.",
      items: [
        {
          name: "House Lemonade",
          description:
            "Fresh lemon, cane sugar, and mint. Small is $3.50 and large is $4.50.",
          price: "$3.50 / $4.50",
          allergens: [],
          dietaryTags: ["vegan", "gluten-free"],
          spiceLevel: null,
        },
        {
          name: "Cold Brew Coffee",
          description:
            "Slow-steeped coffee served over ice. Add oat milk, whole milk, or vanilla syrup for $0.75.",
          price: "$4.25",
          allergens: ["milk"],
          dietaryTags: ["vegan option", "gluten-free"],
          spiceLevel: null,
        },
      ],
    },
  ],
} satisfies ParsedMenuForStorage;

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "restaurant";
}

function cleanAnonymousClientId(anonymousClientId?: string) {
  const trimmed = anonymousClientId?.trim();

  return trimmed && trimmed.length <= 128 ? trimmed : undefined;
}

function normalizeUploadFileHashes(fileHashes: string[]) {
  if (fileHashes.length === 0) {
    throw new Error("Choose at least one menu file.");
  }

  if (fileHashes.length > MAX_UPLOAD_FILES) {
    throw new Error(`Upload ${MAX_UPLOAD_FILES} files or fewer at a time.`);
  }

  return fileHashes.map((hash) => {
    const normalizedHash = hash.trim().toLowerCase();

    if (!sha256HexPattern.test(normalizedHash)) {
      throw new Error("We could not check whether this menu was already uploaded.");
    }

    return normalizedHash;
  });
}

function buildUploadFingerprint(args: {
  fileHashes: string[];
  sourceType: "pdf" | "image";
}) {
  const normalizedHashes = normalizeUploadFileHashes(args.fileHashes);

  return {
    orderedSignature: `sha256:v1:${args.sourceType}:${normalizedHashes.join(":")}`,
    fileCount: normalizedHashes.length,
  };
}

async function saveUploadFingerprint(
  ctx: MutationCtx,
  args: {
    fileHashes?: string[];
    sourceType: "pdf" | "image";
    menuId: Id<"menus">;
    createdAt: number;
  }
) {
  if (!args.fileHashes) {
    return;
  }

  const fingerprint = buildUploadFingerprint({
    fileHashes: args.fileHashes,
    sourceType: args.sourceType,
  });

  await ctx.db.insert("menuUploadFingerprints", {
    ...fingerprint,
    sourceType: args.sourceType,
    menuId: args.menuId,
    createdAt: args.createdAt,
  });
}

function cleanUploadDetails(args: { restaurantName: string; menuTitle: string }) {
  return {
    restaurantName: args.restaurantName.trim() || DEFAULT_UPLOAD_NAME,
    menuTitle: args.menuTitle.trim() || DEFAULT_UPLOAD_NAME,
  };
}

function isNamedPublicMenu(args: { restaurantName: string; menuTitle: string }) {
  return (
    args.restaurantName.trim() !== DEFAULT_UPLOAD_NAME ||
    args.menuTitle.trim() !== DEFAULT_UPLOAD_NAME
  );
}

async function getOrCreateUploadRestaurant(
  ctx: MutationCtx,
  args: {
    restaurantName: string;
    googlePlaceId?: string;
    formattedAddress?: string;
    latitude?: number;
    longitude?: number;
    zipCode?: string;
    cuisineType?: string;
  },
  now: number
) {
  const restaurantName = args.restaurantName.trim();

  if (args.googlePlaceId) {
    const existingRestaurant = await ctx.db
      .query("restaurants")
      .withIndex("by_google_place", (q) => q.eq("googlePlaceId", args.googlePlaceId))
      .first();

    if (existingRestaurant) {
      await ctx.db.patch(existingRestaurant._id, {
        name: restaurantName || existingRestaurant.name,
        formattedAddress: args.formattedAddress ?? existingRestaurant.formattedAddress,
        address: args.formattedAddress ?? existingRestaurant.address,
        latitude: args.latitude ?? existingRestaurant.latitude,
        longitude: args.longitude ?? existingRestaurant.longitude,
        zipCode: args.zipCode ?? existingRestaurant.zipCode,
        cuisineType: args.cuisineType ?? existingRestaurant.cuisineType,
        lastGoogleSyncAt: now,
      });

      return existingRestaurant._id;
    }
  }

  const baseSlug = slugify(restaurantName);

  return await ctx.db.insert("restaurants", {
    name: restaurantName,
    slug: `${baseSlug}-${now.toString(36)}`,
    address: args.formattedAddress,
    formattedAddress: args.formattedAddress,
    latitude: args.latitude,
    longitude: args.longitude,
    zipCode: args.zipCode,
    cuisineType: args.cuisineType,
    googlePlaceId: args.googlePlaceId,
    lastGoogleSyncAt: args.googlePlaceId ? now : undefined,
    claimedByOwner: false,
    createdAt: now,
  });
}

async function getLatestParseJob(ctx: QueryCtx, menuId: Id<"menus">) {
  const jobs = await ctx.db
    .query("menuParseJobs")
    .withIndex("by_menu", (q) => q.eq("menuId", menuId))
    .collect();

  return jobs.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

async function buildMenuSummary(
  ctx: QueryCtx,
  menuId: Id<"menus">,
  options: { allowUnlistedLink?: boolean } = {}
) {
  const menu = await ctx.db.get(menuId);

  if (!menu) {
    return null;
  }

  const restaurant = await ctx.db.get(menu.restaurantId);

  if (!restaurant) {
    return null;
  }

  const identity = await ctx.auth.getUserIdentity();
  const isUploader = identity?.subject === menu.uploadedByUserId;
  const isRestaurantOwner = identity?.subject === restaurant.ownerId;
  const visibility = menu.visibility ?? "public";
  const isPublic = visibility === "public";
  const isUnlistedLink = visibility === "unlisted" && options.allowUnlistedLink;

  if (!isPublic && !isUnlistedLink && !isUploader && !isRestaurantOwner) {
    return null;
  }

  const categories = (
    await ctx.db
      .query("menuCategories")
      .withIndex("by_menu", (q) => q.eq("menuId", menuId))
      .collect()
  ).sort((a, b) => a.sortOrder - b.sortOrder);

  const items = (
    await ctx.db
      .query("menuItems")
      .withIndex("by_menu", (q) => q.eq("menuId", menuId))
      .collect()
  ).sort((a, b) => a.sortOrder - b.sortOrder);

  const parseJob = await getLatestParseJob(ctx, menuId);

  return {
    id: menu._id,
    title: menu.title,
    status: menu.status,
    visibility: menu.visibility ?? "public",
    restaurant: {
      id: restaurant._id,
      name: restaurant.name,
      slug: restaurant.slug,
      cuisineType: restaurant.cuisineType,
      address: restaurant.address,
    },
    categories: categories.map((category) => ({
      id: category._id,
      name: category.name,
      description: category.description,
      sortOrder: category.sortOrder,
    })),
    items: items.map((item) => ({
      id: item._id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      allergens: item.allergens ?? [],
      dietaryTags: item.dietaryTags ?? [],
      spiceLevel: item.spiceLevel,
      isAvailable: item.isAvailable,
      sortOrder: item.sortOrder,
    })),
    parseJob: parseJob
      ? {
          id: parseJob._id,
          status: parseJob.status,
          message: parseJob.message,
          errorMessage: parseJob.errorMessage,
          warnings: parseJob.warnings ?? [],
          totalPages: parseJob.totalPages,
          currentPage: parseJob.currentPage,
          completedPages: parseJob.completedPages,
          updatedAt: parseJob.updatedAt,
        }
      : null,
  };
}

async function replaceMenuContent(
  ctx: MutationCtx,
  menuId: Id<"menus">,
  parsedMenu: ParsedMenuForStorage
) {
  const existingItems = await ctx.db
    .query("menuItems")
    .withIndex("by_menu", (q) => q.eq("menuId", menuId))
    .collect();
  const existingCategories = await ctx.db
    .query("menuCategories")
    .withIndex("by_menu", (q) => q.eq("menuId", menuId))
    .collect();

  for (const item of existingItems) {
    await ctx.db.delete(item._id);
  }

  for (const category of existingCategories) {
    await ctx.db.delete(category._id);
  }

  for (const [categoryIndex, category] of parsedMenu.categories.entries()) {
    const categoryId = await ctx.db.insert("menuCategories", {
      menuId,
      name: category.name,
      description: category.description ?? undefined,
      sortOrder: categoryIndex,
    });

    for (const [itemIndex, item] of category.items.entries()) {
      await ctx.db.insert("menuItems", {
        menuId,
        categoryId,
        name: item.name,
        description: item.description ?? undefined,
        price: item.price ?? undefined,
        allergens: item.allergens,
        dietaryTags: item.dietaryTags,
        spiceLevel: item.spiceLevel ?? undefined,
        isAvailable: true,
        sortOrder: itemIndex,
      });
    }
  }
}

export const createMenuFromUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    restaurantName: v.string(),
    menuTitle: v.string(),
    sourceType: sourceTypeValidator,
    anonymousClientId: anonymousClientIdValidator,
    fileHashes: v.optional(uploadFileHashesValidator),
    ...googleRestaurantValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const anonymousClientId = cleanAnonymousClientId(args.anonymousClientId);

    if (!identity && !anonymousClientId) {
      throw new Error("We could not start this upload. Please refresh and try again.");
    }

    if (args.fileHashes && args.fileHashes.length !== 1) {
      throw new Error("We could not check that menu upload.");
    }

    const now = Date.now();
    const details = cleanUploadDetails(args);
    const restaurantId = await getOrCreateUploadRestaurant(
      ctx,
      { ...args, restaurantName: details.restaurantName },
      now
    );

    const menuId = await ctx.db.insert("menus", {
      restaurantId,
      title: details.menuTitle,
      version: 1,
      status: "processing",
      sourceFileId: args.storageId,
      uploadedByUserId: identity?.subject,
      uploadedByAnonymousId: anonymousClientId,
      visibility: identity ? "private" : "unlisted",
      sourceType: args.sourceType,
      createdAt: now,
    });

    const jobId = await ctx.db.insert("menuParseJobs", {
      menuId,
      status: "queued",
      message: "Menu uploaded. Reading will start soon.",
      createdAt: now,
      updatedAt: now,
    });

    await saveUploadFingerprint(ctx, {
      fileHashes: args.fileHashes,
      sourceType: args.sourceType,
      menuId,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.ai.parseMenu, {
      storageId: args.storageId,
      menuId,
      sourceType: args.sourceType,
    });

    return { restaurantId, menuId, jobId };
  },
});

export const createMenuFromUploads = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
    restaurantName: v.string(),
    menuTitle: v.string(),
    sourceType: sourceTypeValidator,
    anonymousClientId: anonymousClientIdValidator,
    fileHashes: v.optional(uploadFileHashesValidator),
    ...googleRestaurantValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const anonymousClientId = cleanAnonymousClientId(args.anonymousClientId);

    if (!identity && !anonymousClientId) {
      throw new Error("We could not start this upload. Please refresh and try again.");
    }

    if (args.storageIds.length === 0) {
      throw new Error("Upload at least one menu file.");
    }

    if (args.storageIds.length > MAX_UPLOAD_FILES) {
      throw new Error(`Upload ${MAX_UPLOAD_FILES} files or fewer at a time.`);
    }

    if (args.fileHashes && args.fileHashes.length !== args.storageIds.length) {
      throw new Error("We could not check that menu upload.");
    }

    const now = Date.now();
    const details = cleanUploadDetails(args);
    const restaurantId = await getOrCreateUploadRestaurant(
      ctx,
      { ...args, restaurantName: details.restaurantName },
      now
    );

    const menuId = await ctx.db.insert("menus", {
      restaurantId,
      title: details.menuTitle,
      version: 1,
      status: "processing",
      sourceFileId: args.storageIds[0],
      uploadedByUserId: identity?.subject,
      uploadedByAnonymousId: anonymousClientId,
      visibility: identity ? "private" : "unlisted",
      sourceType: args.sourceType,
      createdAt: now,
    });

    const fileCount = args.storageIds.length;
    const jobId = await ctx.db.insert("menuParseJobs", {
      menuId,
      status: "queued",
      message: `${fileCount} menu file${fileCount === 1 ? "" : "s"} uploaded. Reading will start soon.`,
      createdAt: now,
      updatedAt: now,
    });

    await saveUploadFingerprint(ctx, {
      fileHashes: args.fileHashes,
      sourceType: args.sourceType,
      menuId,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.ai.parseMenuUploads, {
      storageIds: args.storageIds,
      menuId,
      sourceType: args.sourceType,
    });

    return { restaurantId, menuId, jobId };
  },
});

export const findMenuByUploadFingerprint = query({
  args: {
    fileHashes: uploadFileHashesValidator,
    sourceType: sourceTypeValidator,
  },
  handler: async (ctx, args) => {
    const fingerprint = buildUploadFingerprint(args);
    const matches = await ctx.db
      .query("menuUploadFingerprints")
      .withIndex("by_ordered_signature", (q) =>
        q.eq("orderedSignature", fingerprint.orderedSignature)
      )
      .collect();

    for (const match of matches) {
      if (
        match.sourceType !== args.sourceType ||
        match.fileCount !== fingerprint.fileCount
      ) {
        continue;
      }

      const menu = await ctx.db.get(match.menuId);

      if (!menu) {
        continue;
      }

      const visibility = menu.visibility ?? "public";
      const canReuse =
        menu.status === "ready" &&
        (visibility === "public" || visibility === "unlisted");

      if (canReuse) {
        return {
          menuId: menu._id,
          restaurantId: menu.restaurantId,
        };
      }
    }

    return null;
  },
});

export const updateUploadedMenuDetails = mutation({
  args: {
    menuId: v.id("menus"),
    restaurantName: v.optional(v.string()),
    menuTitle: v.optional(v.string()),
    anonymousClientId: anonymousClientIdValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const anonymousClientId = cleanAnonymousClientId(args.anonymousClientId);

    const menu = await ctx.db.get(args.menuId);

    if (!menu) {
      throw new Error("Menu not found.");
    }

    const restaurant = await ctx.db.get(menu.restaurantId);

    if (!restaurant) {
      throw new Error("Restaurant record not found.");
    }

    const isUploader = identity?.subject === menu.uploadedByUserId;
    const isRestaurantOwner = identity?.subject === restaurant.ownerId;
    const isAnonymousUploader =
      anonymousClientId && anonymousClientId === menu.uploadedByAnonymousId;

    if (!isUploader && !isRestaurantOwner && !isAnonymousUploader) {
      throw new Error("You do not have permission to update this menu.");
    }

    const now = Date.now();
    const restaurantName = args.restaurantName?.trim();
    const menuTitle = args.menuTitle?.trim();
    const shouldPublishAnonymousMenu =
      Boolean(isAnonymousUploader) && Boolean(restaurantName || menuTitle);

    if (restaurantName) {
      await ctx.db.patch(restaurant._id, {
        name: restaurantName,
        slug: `${slugify(restaurantName)}-${now.toString(36)}`,
      });
    }

    const menuPatch: {
      title?: string;
      visibility?: "public";
      lastEditedAt: number;
    } = {
      lastEditedAt: now,
    };

    if (menuTitle) {
      menuPatch.title = menuTitle;
    }

    if (shouldPublishAnonymousMenu) {
      menuPatch.visibility = "public";
    }

    await ctx.db.patch(menu._id, menuPatch);

    return { menuId: menu._id, restaurantId: restaurant._id };
  },
});

export const seedSampleMenu = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const existingRestaurant = await ctx.db
      .query("restaurants")
      .withIndex("by_slug", (q) => q.eq("slug", SAMPLE_RESTAURANT_SLUG))
      .first();

    const restaurantId =
      existingRestaurant?._id ??
      (await ctx.db.insert("restaurants", {
        name: SAMPLE_RESTAURANT_NAME,
        slug: SAMPLE_RESTAURANT_SLUG,
        cuisineType: "Cafe",
        claimedByOwner: false,
        createdAt: now,
      }));

    if (existingRestaurant) {
      await ctx.db.patch(existingRestaurant._id, {
        name: SAMPLE_RESTAURANT_NAME,
        slug: SAMPLE_RESTAURANT_SLUG,
        cuisineType: existingRestaurant.cuisineType ?? "Cafe",
      });
    }

    const existingMenus = await ctx.db
      .query("menus")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId))
      .collect();
    const existingSampleMenu = existingMenus.find(
      (menu) => menu.title === SAMPLE_MENU_TITLE && menu.sourceType === "manual"
    );
    const menuId =
      existingSampleMenu?._id ??
      (await ctx.db.insert("menus", {
        restaurantId,
        title: SAMPLE_MENU_TITLE,
        version: 1,
        status: "ready",
        visibility: "public",
        sourceType: "manual",
        processedAt: now,
        publishedAt: now,
        createdAt: now,
      }));

    await ctx.db.patch(menuId, {
      title: SAMPLE_MENU_TITLE,
      version: 1,
      status: "ready",
      visibility: "public",
      sourceType: "manual",
      processedAt: now,
      publishedAt: existingSampleMenu?.publishedAt ?? now,
      lastEditedAt: now,
    });

    await replaceMenuContent(ctx, menuId, sampleMenuFixture);

    return {
      restaurantId,
      menuId,
      categoryCount: sampleMenuFixture.categories.length,
      itemCount: sampleMenuFixture.categories.reduce(
        (total, category) => total + category.items.length,
        0
      ),
    };
  },
});

export const listPublicMenus = query({
  args: {},
  handler: async (ctx) => {
    const menus = await ctx.db
      .query("menus")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .collect();
    const summaries = [];

    for (const menu of menus) {
      if ((menu.visibility ?? "public") !== "public") {
        continue;
      }

      const restaurant = await ctx.db.get(menu.restaurantId);

      if (!restaurant) {
        continue;
      }

      if (
        !isNamedPublicMenu({
          restaurantName: restaurant.name,
          menuTitle: menu.title,
        })
      ) {
        continue;
      }

      const categories = await ctx.db
        .query("menuCategories")
        .withIndex("by_menu", (q) => q.eq("menuId", menu._id))
        .collect();
      const items = await ctx.db
        .query("menuItems")
        .withIndex("by_menu", (q) => q.eq("menuId", menu._id))
        .collect();

      summaries.push({
        id: menu._id,
        title: menu.title,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        categoryCount: categories.length,
        itemCount: items.length,
        createdAt: menu.createdAt,
        processedAt: menu.processedAt,
      });
    }

    return summaries.sort(
      (a, b) => (b.processedAt ?? b.createdAt) - (a.processedAt ?? a.createdAt)
    );
  },
});

export const getMenu = query({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    return await buildMenuSummary(ctx, args.menuId, { allowUnlistedLink: true });
  },
});

export const getMenuByIdentifier = query({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    const menuId = ctx.db.normalizeId("menus", args.identifier);

    if (menuId) {
      return await buildMenuSummary(ctx, menuId, { allowUnlistedLink: true });
    }

    const restaurant = await ctx.db
      .query("restaurants")
      .withIndex("by_slug", (q) => q.eq("slug", args.identifier))
      .first();

    if (!restaurant) {
      return null;
    }

    const menus = await ctx.db
      .query("menus")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurant._id))
      .collect();

    const latestMenu = menus
      .filter((menu) => (menu.visibility ?? "public") !== "unlisted")
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!latestMenu) {
      return null;
    }

    return await buildMenuSummary(ctx, latestMenu._id);
  },
});

export const getParseJob = query({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    const parseJob = await getLatestParseJob(ctx, args.menuId);

    if (!parseJob) {
      return null;
    }

    return {
      id: parseJob._id,
      status: parseJob.status,
      message: parseJob.message,
      errorMessage: parseJob.errorMessage,
      warnings: parseJob.warnings ?? [],
      totalPages: parseJob.totalPages,
      currentPage: parseJob.currentPage,
      completedPages: parseJob.completedPages,
      updatedAt: parseJob.updatedAt,
    };
  },
});

export const updateParseJob = internalMutation({
  args: {
    menuId: v.id("menus"),
    status: parseStatusValidator,
    message: v.string(),
    errorMessage: v.optional(v.string()),
    totalPages: v.optional(v.float64()),
    currentPage: v.optional(v.float64()),
    completedPages: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const parseJob = await ctx.db
      .query("menuParseJobs")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .first();

    if (!parseJob) {
      return;
    }

    await ctx.db.patch(parseJob._id, {
      status: args.status,
      message: args.message,
      errorMessage: args.errorMessage,
      totalPages: args.totalPages,
      currentPage: args.currentPage,
      completedPages: args.completedPages,
      updatedAt: Date.now(),
    });
  },
});

export const saveParsedMenu = internalMutation({
  args: {
    menuId: v.id("menus"),
    parsedMenu: parsedMenuValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await replaceMenuContent(ctx, args.menuId, args.parsedMenu);

    await ctx.db.patch(args.menuId, {
      status: "ready",
      processedAt: now,
      lastEditedAt: now,
    });

    const parseJob = await ctx.db
      .query("menuParseJobs")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .first();

    if (parseJob) {
      const totalPages = parseJob.totalPages ?? parseJob.completedPages;

      await ctx.db.patch(parseJob._id, {
        status: "ready",
        message: "Your accessible menu is ready.",
        errorMessage: undefined,
        warnings: args.parsedMenu.warnings,
        totalPages,
        currentPage: undefined,
        completedPages: totalPages,
        updatedAt: now,
      });
    }
  },
});

export const markParseFailed = internalMutation({
  args: {
    menuId: v.id("menus"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.patch(args.menuId, {
      status: "processing",
      lastEditedAt: now,
    });

    const parseJob = await ctx.db
      .query("menuParseJobs")
      .withIndex("by_menu", (q) => q.eq("menuId", args.menuId))
      .first();

    if (parseJob) {
      await ctx.db.patch(parseJob._id, {
        status: "failed",
        message: "We could not read that menu.",
        errorMessage: args.errorMessage,
        warnings: undefined,
        currentPage: undefined,
        updatedAt: now,
      });
    }
  },
});
