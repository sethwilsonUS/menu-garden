"use node";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";

type SourceType = "pdf" | "image";

type MenuParseInput =
  | {
      kind: "image";
      imageUrl: string;
      label: string;
    }
  | {
      kind: "pdf";
      fileData: string;
      filename: string;
      label: string;
    };

type ParsedMenu = {
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

type ChatContext = {
  menuTitle: string;
  restaurantName: string;
  menuContext: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  items: Array<{
    id: Id<"menuItems">;
    name: string;
    description?: string;
    price?: string;
    allergens: string[];
    dietaryTags: string[];
    spiceLevel?: string;
  }>;
};

type ReferencedItems = {
  itemIds: string[];
};

type NutritionAnalysis = {
  likelyGoodOptions: Array<{
    itemId: string;
    reason: string;
  }>;
  maybeOptions: Array<{
    itemId: string;
    reason: string;
  }>;
  lessIdealOptions: Array<{
    itemId: string;
    reason: string;
  }>;
  uncertaintyNote: string;
};

const USER_PARSE_ERROR =
  "We could not read that menu. Try uploading a clearer photo or PDF.";
const USER_CHAT_ERROR =
  "I could not answer that just now. Please try again in a moment.";
const chatJobCleanupDelayMs = 15 * 60 * 1000;

const MENU_EXTRACTION_PROMPT = `You are a menu extraction assistant. Extract every item from this restaurant menu image and organize it by category exactly as it appears. For each item include:
- name (exactly as written)
- description (if present)
- price (as a string, e.g. "$12.99" or "Market Price"; null if absent)
- allergens: infer from ingredient descriptions. Use only these values: ["gluten", "dairy", "nuts", "shellfish", "eggs", "soy", "fish"]
- dietaryTags: infer from descriptions. Use only these values: ["vegetarian", "vegan", "gf", "halal", "kosher"]
- spiceLevel: if mentioned, one of ["mild", "medium", "hot", "extra-hot"]; otherwise null

The source may be a printed menu, a photo of an overhead counter menu board, a drive-through or fast-food board, one page of a multi-page menu, or a browser-printed PDF of a website menu. Preserve combo names, size names, modifier groups, price columns, and source/category ordering. Ignore browser print headers, footers, navigation links, cookie banners, and unrelated website chrome. If this source appears to continue a category from a previous source, use that same category name rather than inventing a new continuation label. If text is blurry, cut off, hidden by glare, or uncertain, add a short user-friendly warning to warnings.

Return ONLY valid JSON matching the schema. Do not include any commentary.`;

const MENU_CHAT_PROMPT = `You are a helpful assistant for a restaurant menu. Answer questions about the menu items, ingredients, allergens, dietary options, and prices based on the menu provided. Be concise and friendly.

For explicit menu facts like prices, ingredients, allergens, dietary tags, and availability, use only what the menu says. Do not invent facts.

For broader nutrition-style questions such as low glycemic index, blood sugar, low carb, lighter options, protein, sodium, fat, cholesterol, or calories, you may make careful food-pattern inferences from the item names, descriptions, categories, and common food knowledge. Always make the uncertainty clear. Do not give medical advice, exact nutrition numbers, or exact glycemic-index claims unless the menu explicitly provides them. Avoid stock disclaimers like "ensure to consult." If a medical caveat is useful, say it plainly: "For personalized medical advice, check with a healthcare professional."`;

const NUTRITION_ANALYSIS_PROMPT = `You are helping classify restaurant menu items for a nutrition-style question. Use the visible menu text plus common food knowledge. Return likely helpful menu items, maybe items, and likely less ideal items.

For low glycemic index, blood sugar, diabetes, low carb, and keto questions, generally prefer protein-forward, vegetable-forward, unsweetened, and non-breaded items. Be cautious with rice, bread, pasta, tortillas, potatoes, sugary sauces, desserts, sweet drinks, and fried breaded items.

Do not claim exact nutrition, calories, carbs, or glycemic index unless the menu explicitly states them. Keep reasons brief and tied to item names/descriptions. Return only valid JSON.`;

const parsedMenuSchema = {
  type: "object",
  additionalProperties: false,
  required: ["warnings", "categories"],
  properties: {
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "items"],
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "name",
                "description",
                "price",
                "allergens",
                "dietaryTags",
                "spiceLevel",
              ],
              properties: {
                name: { type: "string" },
                description: { type: ["string", "null"] },
                price: { type: ["string", "null"] },
                allergens: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: [
                      "gluten",
                      "dairy",
                      "nuts",
                      "shellfish",
                      "eggs",
                      "soy",
                      "fish",
                    ],
                  },
                },
                dietaryTags: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["vegetarian", "vegan", "gf", "halal", "kosher"],
                  },
                },
                spiceLevel: {
                  type: ["string", "null"],
                  enum: ["mild", "medium", "hot", "extra-hot", null],
                },
              },
            },
          },
        },
      },
    },
  },
};

const referencedItemsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["itemIds"],
  properties: {
    itemIds: {
      type: "array",
      items: { type: "string" },
    },
  },
};

const nutritionAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "likelyGoodOptions",
    "maybeOptions",
    "lessIdealOptions",
    "uncertaintyNote",
  ],
  properties: {
    likelyGoodOptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["itemId", "reason"],
        properties: {
          itemId: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    maybeOptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["itemId", "reason"],
        properties: {
          itemId: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    lessIdealOptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["itemId", "reason"],
        properties: {
          itemId: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    uncertaintyNote: { type: "string" },
  },
};

const ephemeralChatHistoryValidator = v.array(
  v.object({
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  })
);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown parsing error.";
}

function getOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return apiKey;
}

async function getMenuParseInputs(
  blob: Blob,
  sourceType: SourceType,
  inputNumber = 1
) {
  const contentType = blob.type || (sourceType === "pdf" ? "application/pdf" : "image/jpeg");
  const fileBuffer = Buffer.from(await blob.arrayBuffer());
  const base64 = fileBuffer.toString("base64");

  if (sourceType !== "pdf") {
    return [
      {
        kind: "image" as const,
        imageUrl: `data:${contentType};base64,${base64}`,
        label: `page ${inputNumber}`,
      },
    ];
  }

  return [
    {
      kind: "pdf" as const,
      fileData: `data:application/pdf;base64,${base64}`,
      filename: `menu-${inputNumber}.pdf`,
      label: `PDF file ${inputNumber}`,
    },
  ];
}

async function getMenuParseInputsFromStorageIds(
  ctx: ActionCtx,
  storageIds: Array<Id<"_storage">>,
  sourceType: SourceType
) {
  const inputs: MenuParseInput[] = [];

  for (const [index, storageId] of storageIds.entries()) {
    const storedFile = await ctx.storage.get(storageId);

    if (!storedFile) {
      throw new Error("Uploaded file could not be found in Convex storage.");
    }

    inputs.push(...(await getMenuParseInputs(storedFile, sourceType, index + 1)));
  }

  return inputs;
}

function extractOutputText(response: unknown) {
  const output = (response as { output?: unknown[] }).output ?? [];

  for (const item of output) {
    const content = (item as { content?: unknown[] }).content ?? [];

    for (const contentItem of content) {
      const text = (contentItem as { text?: unknown }).text;

      if (typeof text === "string") {
        return text;
      }
    }
  }

  const outputText = (response as { output_text?: unknown }).output_text;

  if (typeof outputText === "string") {
    return outputText;
  }

  throw new Error("OpenAI did not return parseable menu JSON.");
}

function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeParsedMenu(parsedMenus: ParsedMenu[]): ParsedMenu {
  const categories: ParsedMenu["categories"] = [];

  for (const category of parsedMenus.flatMap((parsedMenu) => parsedMenu.categories)) {
    const previousCategory = categories[categories.length - 1];

    if (
      previousCategory &&
      normalizeCategoryName(previousCategory.name) === normalizeCategoryName(category.name)
    ) {
      previousCategory.items.push(...category.items);
      previousCategory.description ??= category.description;
      continue;
    }

    categories.push({
      ...category,
      items: [...category.items],
    });
  }

  return {
    warnings: parsedMenus.flatMap((parsedMenu) => parsedMenu.warnings),
    categories,
  };
}

function getParseInputContent(input: MenuParseInput) {
  if (input.kind === "image") {
    return [
      {
        type: "input_image" as const,
        image_url: input.imageUrl,
        detail: "high" as const,
      },
    ];
  }

  return [
    {
      type: "input_file" as const,
      filename: input.filename,
      file_data: input.fileData,
    },
  ];
}

async function parseMenuInputWithOpenAI(
  input: MenuParseInput,
  extractionChecklist?: string | null
) {
  const apiKey = getOpenAIKey();
  const checklistText = extractionChecklist
    ? `\n\nBefore returning JSON, use this menu-section checklist from a first pass over the same PDF. The final JSON should cover all relevant sections from this checklist, not just the first section:\n${extractionChecklist}`
    : "";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MENU_PARSE_MODEL ?? "gpt-4o-2024-08-06",
      instructions: MENU_EXTRACTION_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Extract the complete menu from ${input.label}. For PDFs, read all pages in that PDF and ignore browser print headers, footers, navigation, cookie banners, and unrelated website chrome. Do not stop after the first category or first page. Include breakfast, lunch, dinner, sandwiches, meats, sides, tacos, kids, desserts, drinks, and any other menu sections when present.${checklistText}`,
            },
            ...getParseInputContent(input),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "parsed_menu",
          strict: true,
          schema: parsedMenuSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI menu parsing failed: ${details}`);
  }

  const json = await response.json();
  return JSON.parse(extractOutputText(json)) as ParsedMenu;
}

async function inventoryMenuInputWithOpenAI(input: Extract<MenuParseInput, { kind: "pdf" }>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MENU_PARSE_MODEL ?? "gpt-4o-2024-08-06",
      instructions:
        "You are preparing a restaurant menu extraction checklist. Inspect the whole PDF and identify every menu section/category visible across all pages. Ignore browser print headers, footers, navigation, cookie banners, and unrelated website chrome. Return concise plain text only.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "List every restaurant menu category or section in this PDF, with 2-5 example item names for each section. Pay special attention to sections after breakfast and later pages.",
            },
            ...getParseInputContent(input),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const json = await response.json();

  try {
    return extractOutputText(json).trim().slice(0, 4000);
  } catch {
    return null;
  }
}

function formatInputCount(inputCount: number) {
  return `${inputCount} menu upload${inputCount === 1 ? "" : "s"}`;
}

async function parseInputsWithProgress(
  ctx: ActionCtx,
  menuId: Id<"menus">,
  inputs: MenuParseInput[]
) {
  const totalInputs = inputs.length;
  const parsedPages: ParsedMenu[] = [];

  await ctx.runMutation(internal.menus.updateParseJob, {
    menuId,
    status: "extracting",
    message: `Starting AI reading for ${formatInputCount(totalInputs)}.`,
    totalPages: totalInputs,
    currentPage: totalInputs > 0 ? 1 : undefined,
    completedPages: 0,
  });

  for (const [index, input] of inputs.entries()) {
    const inputNumber = index + 1;

    await ctx.runMutation(internal.menus.updateParseJob, {
      menuId,
      status: "extracting",
      message: `Reading ${input.label} of ${totalInputs} with AI.`,
      totalPages: totalInputs,
      currentPage: inputNumber,
      completedPages: index,
    });

    let extractionChecklist: string | null = null;

    if (input.kind === "pdf") {
      await ctx.runMutation(internal.menus.updateParseJob, {
        menuId,
        status: "extracting",
        message: `Finding menu sections in ${input.label}.`,
        totalPages: totalInputs,
        currentPage: inputNumber,
        completedPages: index,
      });

      extractionChecklist = await inventoryMenuInputWithOpenAI(input);

      await ctx.runMutation(internal.menus.updateParseJob, {
        menuId,
        status: "extracting",
        message: `Extracting the complete menu from ${input.label}.`,
        totalPages: totalInputs,
        currentPage: inputNumber,
        completedPages: index,
      });
    }

    parsedPages.push(await parseMenuInputWithOpenAI(input, extractionChecklist));

    await ctx.runMutation(internal.menus.updateParseJob, {
      menuId,
      status: "extracting",
      message:
        inputNumber === totalInputs
          ? `Finished reading ${formatInputCount(totalInputs)}.`
          : `Finished ${input.label} of ${totalInputs}.`,
      totalPages: totalInputs,
      currentPage: inputNumber === totalInputs ? undefined : inputNumber + 1,
      completedPages: inputNumber,
    });
  }

  return parsedPages;
}

function isNutritionQuestion(question: string) {
  return /\b(glycemic|blood sugar|diabetic|diabetes|low carb|keto|carbs?|sugar|healthy|healthier|lighter|protein|sodium|salt|fat|cholesterol|calorie|calories)\b/i.test(
    question
  );
}

function buildNutritionAnalysisContext(analysis: NutritionAnalysis) {
  const formatItems = (
    label: string,
    items: Array<{ itemId: string; reason: string }>
  ) =>
    items.length
      ? `${label}:\n${items
          .map((item) => `- [${item.itemId}] ${item.reason}`)
          .join("\n")}`
      : `${label}: none identified`;

  return [
    "Nutrition analysis from a separate reasoning pass:",
    "Use this analysis to give a helpful recommendation. Do not answer only that the menu lacks nutrition data; include that limitation as a caveat after naming likely options.",
    formatItems("Likely good options", analysis.likelyGoodOptions),
    formatItems("Maybe options", analysis.maybeOptions),
    formatItems("Likely less ideal options", analysis.lessIdealOptions),
    `Uncertainty note: ${analysis.uncertaintyNote}`,
  ].join("\n\n");
}

function getNutritionReferencedItemIds(
  context: ChatContext,
  analysis: NutritionAnalysis
) {
  const validIds = new Set(context.items.map((item) => item.id));
  const orderedIds = [
    ...analysis.likelyGoodOptions.map((item) => item.itemId),
    ...analysis.maybeOptions.map((item) => item.itemId),
  ];
  const seen = new Set<string>();

  return orderedIds.filter((itemId): itemId is Id<"menuItems"> => {
    if (!validIds.has(itemId as Id<"menuItems">) || seen.has(itemId)) {
      return false;
    }

    seen.add(itemId);
    return true;
  });
}

function buildChatInput(context: ChatContext, extraContext?: string) {
  return [
    {
      role: "user",
      content: [
        `Menu context:\n${context.menuContext}`,
        extraContext ? `\n${extraContext}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    ...context.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

function parseSseEvents(buffer: string) {
  const events = buffer.split("\n\n");

  return {
    completeEvents: events.slice(0, -1),
    remainder: events[events.length - 1] ?? "",
  };
}

function getSseData(event: string) {
  return event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");
}

async function streamAnswerWithOpenAI(
  ctx: ActionCtx,
  args: {
    context: ChatContext;
    assistantMessageId: Id<"chatMessages">;
    extraContext?: string;
  }
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MENU_CHAT_MODEL ?? "gpt-4o-2024-08-06",
      instructions: MENU_CHAT_PROMPT,
      input: buildChatInput(args.context, args.extraContext),
      stream: true,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI menu chat failed: ${details}`);
  }

  if (!response.body) {
    throw new Error("OpenAI did not return a readable response stream.");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let answer = "";
  let lastSavedAt = 0;

  async function saveIfNeeded(force = false) {
    const now = Date.now();

    if (!force && now - lastSavedAt < 450) {
      return;
    }

    lastSavedAt = now;
    await ctx.runMutation(internal.chat.updateAssistantMessage, {
      messageId: args.assistantMessageId,
      content: answer,
      status: "streaming",
    });
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const { completeEvents, remainder } = parseSseEvents(buffer);
    buffer = remainder;

    for (const event of completeEvents) {
      const data = getSseData(event);

      if (!data || data === "[DONE]") {
        continue;
      }

      const parsed = JSON.parse(data) as {
        type?: string;
        delta?: string;
        error?: { message?: string };
      };

      if (parsed.type === "response.output_text.delta" && parsed.delta) {
        answer += parsed.delta;
        await saveIfNeeded();
      }

      if (parsed.type === "response.failed") {
        throw new Error(parsed.error?.message ?? "OpenAI menu chat failed.");
      }
    }
  }

  await saveIfNeeded(true);

  return answer.trim();
}

async function answerWithOpenAI(context: ChatContext, extraContext?: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MENU_CHAT_MODEL ?? "gpt-4o-2024-08-06",
      instructions: MENU_CHAT_PROMPT,
      input: buildChatInput(context, extraContext),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI menu chat failed: ${details}`);
  }

  const json = await response.json();
  return extractOutputText(json).trim();
}

async function analyzeNutritionQuestion(context: ChatContext, question: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MENU_NUTRITION_MODEL ?? "gpt-4o-2024-08-06",
      instructions: NUTRITION_ANALYSIS_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `User question:\n${question}\n\nMenu context:\n${context.menuContext}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "nutrition_menu_analysis",
          strict: true,
          schema: nutritionAnalysisSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI nutrition analysis failed: ${details}`);
  }

  const json = await response.json();
  return JSON.parse(extractOutputText(json)) as NutritionAnalysis;
}

async function identifyReferencedItems(context: ChatContext, answer: string) {
  if (!answer || context.items.length === 0) {
    return [];
  }

  const itemList = context.items
    .map((item) => {
      const details = [
        item.price ? `price ${item.price}` : null,
        item.description ? `description ${item.description}` : null,
        item.allergens.length ? `allergens ${item.allergens.join(", ")}` : null,
        item.dietaryTags.length ? `dietary tags ${item.dietaryTags.join(", ")}` : null,
        item.spiceLevel ? `spice ${item.spiceLevel}` : null,
      ].filter(Boolean);

      return `[${item.id}] ${item.name}${details.length ? `: ${details.join("; ")}` : ""}`;
    })
    .join("\n");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MENU_REFERENCE_MODEL ?? "gpt-4o-2024-08-06",
      instructions:
        "Return only menu item IDs that are directly recommended, named, or clearly relevant to the assistant answer. Do not include IDs that are merely in the menu context.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Menu items:\n${itemList}\n\nAssistant answer:\n${answer}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "referenced_menu_items",
          strict: true,
          schema: referencedItemsSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    return [];
  }

  const json = await response.json();
  const parsed = JSON.parse(extractOutputText(json)) as ReferencedItems;
  const validIds = new Set(context.items.map((item) => item.id));

  return parsed.itemIds.filter((itemId): itemId is Id<"menuItems"> =>
    validIds.has(itemId as Id<"menuItems">)
  );
}

export const parseMenu = internalAction({
  args: {
    storageId: v.id("_storage"),
    menuId: v.id("menus"),
    sourceType: v.union(v.literal("pdf"), v.literal("image")),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.menus.updateParseJob, {
        menuId: args.menuId,
        status: args.sourceType === "pdf" ? "converting" : "extracting",
        message:
          args.sourceType === "pdf"
            ? "Preparing PDF for AI reading."
            : "Reading the menu image.",
        totalPages: undefined,
        currentPage: undefined,
        completedPages: undefined,
      });

      const storedFile = await ctx.storage.get(args.storageId as Id<"_storage">);

      if (!storedFile) {
        throw new Error("Uploaded file could not be found in Convex storage.");
      }

      const parseInputs = await getMenuParseInputs(storedFile, args.sourceType);

      if (parseInputs.length === 0) {
        throw new Error("No menu uploads were available for parsing.");
      }

      const parsedPages = await parseInputsWithProgress(ctx, args.menuId, parseInputs);

      await ctx.runMutation(internal.menus.updateParseJob, {
        menuId: args.menuId,
        status: "saving",
        message: "Building the accessible menu.",
        totalPages: parseInputs.length,
        currentPage: undefined,
        completedPages: parseInputs.length,
      });

      await ctx.runMutation(internal.menus.saveParsedMenu, {
        menuId: args.menuId,
        parsedMenu: normalizeParsedMenu(parsedPages),
      });
    } catch (error) {
      console.error(error);
      await ctx.runMutation(internal.menus.markParseFailed, {
        menuId: args.menuId,
        errorMessage: USER_PARSE_ERROR,
      });
    }
  },
});

export const parseMenuUploads = internalAction({
  args: {
    storageIds: v.array(v.id("_storage")),
    menuId: v.id("menus"),
    sourceType: v.union(v.literal("pdf"), v.literal("image")),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.menus.updateParseJob, {
        menuId: args.menuId,
        status: args.sourceType === "pdf" ? "converting" : "extracting",
        message:
          args.sourceType === "pdf"
            ? `Preparing ${args.storageIds.length} PDF file${
                args.storageIds.length === 1 ? "" : "s"
              }.`
            : `Reading ${args.storageIds.length} menu image${
                args.storageIds.length === 1 ? "" : "s"
              }.`,
        totalPages: undefined,
        currentPage: undefined,
        completedPages: undefined,
      });

      const parseInputs = await getMenuParseInputsFromStorageIds(
        ctx,
        args.storageIds as Array<Id<"_storage">>,
        args.sourceType
      );

      if (parseInputs.length === 0) {
        throw new Error("No menu uploads were available for parsing.");
      }

      const parsedPages = await parseInputsWithProgress(ctx, args.menuId, parseInputs);

      await ctx.runMutation(internal.menus.updateParseJob, {
        menuId: args.menuId,
        status: "saving",
        message: "Building the accessible menu.",
        totalPages: parseInputs.length,
        currentPage: undefined,
        completedPages: parseInputs.length,
      });

      await ctx.runMutation(internal.menus.saveParsedMenu, {
        menuId: args.menuId,
        parsedMenu: normalizeParsedMenu(parsedPages),
      });
    } catch (error) {
      console.error(error);
      await ctx.runMutation(internal.menus.markParseFailed, {
        menuId: args.menuId,
        errorMessage: USER_PARSE_ERROR,
      });
    }
  },
});

export const answerMenuQuestion = internalAction({
  args: {
    menuId: v.id("menus"),
    sessionId: v.id("chatSessions"),
    userMessageId: v.id("chatMessages"),
    assistantMessageId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    try {
      const context = (await ctx.runQuery(internal.chat.getMenuChatContext, {
        menuId: args.menuId,
        sessionId: args.sessionId,
        assistantMessageId: args.assistantMessageId,
      })) as ChatContext;
      const answer = await streamAnswerWithOpenAI(ctx, {
        context,
        assistantMessageId: args.assistantMessageId,
      });
      const referencedItemIds = await identifyReferencedItems(context, answer);

      await ctx.runMutation(internal.chat.updateAssistantMessage, {
        messageId: args.assistantMessageId,
        content: answer,
        status: "complete",
        referencedItemIds,
      });
    } catch (error) {
      console.error(error);
      await ctx.runMutation(internal.chat.updateAssistantMessage, {
        messageId: args.assistantMessageId,
        status: "failed",
        errorMessage: USER_CHAT_ERROR,
      });
    }
  },
});

export const answerAnonymousChatJob = internalAction({
  args: {
    jobId: v.id("anonymousChatJobs"),
  },
  handler: async (ctx, args) => {
    let totalSteps = 4;

    try {
      await ctx.runMutation(internal.chat.updateAnonymousChatJob, {
        jobId: args.jobId,
        status: "loading_menu",
        message: "Reading the parsed menu.",
        step: 2,
        totalSteps,
      });

      const { job, context } = (await ctx.runQuery(
        internal.chat.getAnonymousChatJobContext,
        { jobId: args.jobId }
      )) as {
        job: {
          id: Id<"anonymousChatJobs">;
          question: string;
        };
        context: ChatContext;
      };
      const shouldAnalyzeNutrition = isNutritionQuestion(job.question);
      totalSteps = shouldAnalyzeNutrition ? 5 : 4;
      let nutritionAnalysis: NutritionAnalysis | null = null;
      let extraContext: string | undefined;

      if (shouldAnalyzeNutrition) {
        await ctx.runMutation(internal.chat.updateAnonymousChatJob, {
          jobId: args.jobId,
          status: "analyzing_nutrition",
          message: "Looking for nutrition clues in the menu.",
          step: 3,
          totalSteps,
        });

        nutritionAnalysis = await analyzeNutritionQuestion(context, job.question);
        extraContext = buildNutritionAnalysisContext(nutritionAnalysis);
      }

      await ctx.runMutation(internal.chat.updateAnonymousChatJob, {
        jobId: args.jobId,
        status: "drafting_answer",
        message: "Writing a careful answer.",
        step: shouldAnalyzeNutrition ? 4 : 3,
        totalSteps,
      });

      const answer = await answerWithOpenAI(context, extraContext);

      await ctx.runMutation(internal.chat.updateAnonymousChatJob, {
        jobId: args.jobId,
        status: "finding_items",
        message: "Finding matching menu items.",
        step: shouldAnalyzeNutrition ? 5 : 4,
        totalSteps,
      });

      const referencedItemIds = nutritionAnalysis
        ? getNutritionReferencedItemIds(context, nutritionAnalysis)
        : await identifyReferencedItems(context, answer);

      await ctx.runMutation(internal.chat.updateAnonymousChatJob, {
        jobId: args.jobId,
        status: "complete",
        message: "Answer complete.",
        step: totalSteps,
        totalSteps,
        answer,
        referencedItemIds,
      });
    } catch (error) {
      console.error(error);
      await ctx.runMutation(internal.chat.updateAnonymousChatJob, {
        jobId: args.jobId,
        status: "failed",
        message: "The assistant could not answer this question.",
        step: totalSteps,
        totalSteps,
        errorMessage: USER_CHAT_ERROR,
      });
    } finally {
      await ctx.scheduler.runAfter(chatJobCleanupDelayMs, internal.chat.cleanupAnonymousChatJob, {
        jobId: args.jobId,
      });
    }
  },
});

export const answerMenuQuestionEphemeral = action({
  args: {
    menuId: v.id("menus"),
    question: v.string(),
    anonymousClientId: v.optional(v.string()),
    history: v.optional(ephemeralChatHistoryValidator),
  },
  handler: async (ctx, args) => {
    const question = args.question.trim();

    if (!question) {
      throw new Error("Ask a menu question before sending.");
    }

    if (question.length > 2000) {
      throw new Error("Keep menu questions under 2,000 characters.");
    }

    const baseContext = (await ctx.runQuery(internal.chat.getEphemeralMenuChatContext, {
      menuId: args.menuId,
      anonymousClientId: args.anonymousClientId,
    })) as ChatContext;
    const recentHistory = (args.history ?? [])
      .map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }))
      .filter((message) => message.content.length > 0)
      .slice(-10);
    const context: ChatContext = {
      ...baseContext,
      messages: [...recentHistory, { role: "user", content: question }],
    };

    try {
      const answer = await answerWithOpenAI(context);
      const referencedItemIds = await identifyReferencedItems(context, answer);

      return {
        answer,
        referencedItemIds,
      };
    } catch (error) {
      console.error(error);
      throw new Error(USER_CHAT_ERROR);
    }
  },
});
