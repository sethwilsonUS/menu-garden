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
  visualAssessment: VisualAssessment;
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

type VisualAssessment = {
  status: "complete" | "partial" | "insufficient";
  note: string | null;
  issues: string[];
  actionSteps: string[];
};

type ParsedMenuPage = {
  label: string;
  parsedMenu: ParsedMenu;
};

type ParsePageContext = {
  inputNumber: number;
  totalInputs: number;
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

type OpenAIUseCase = "parse" | "chat" | "nutrition" | "reference";
type OpenAIReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
type OpenAITextVerbosity = "low" | "medium" | "high";

type OpenAIRequestBody = Record<string, unknown> & {
  text?: Record<string, unknown>;
};

const OPENAI_MODEL_CONFIG: Record<
  OpenAIUseCase,
  {
    defaultModel: string;
    defaultReasoningEffort: OpenAIReasoningEffort;
    modelEnv: string;
    reasoningEnv: string;
    textVerbosity?: OpenAITextVerbosity;
  }
> = {
  parse: {
    defaultModel: "gpt-4o-2024-08-06",
    defaultReasoningEffort: "low",
    modelEnv: "OPENAI_MENU_PARSE_MODEL",
    reasoningEnv: "OPENAI_MENU_PARSE_REASONING_EFFORT",
  },
  chat: {
    defaultModel: "gpt-4o-2024-08-06",
    defaultReasoningEffort: "none",
    modelEnv: "OPENAI_MENU_CHAT_MODEL",
    reasoningEnv: "OPENAI_MENU_CHAT_REASONING_EFFORT",
    textVerbosity: "low",
  },
  nutrition: {
    defaultModel: "gpt-4o-2024-08-06",
    defaultReasoningEffort: "low",
    modelEnv: "OPENAI_MENU_NUTRITION_MODEL",
    reasoningEnv: "OPENAI_MENU_NUTRITION_REASONING_EFFORT",
  },
  reference: {
    defaultModel: "gpt-4o-2024-08-06",
    defaultReasoningEffort: "none",
    modelEnv: "OPENAI_MENU_REFERENCE_MODEL",
    reasoningEnv: "OPENAI_MENU_REFERENCE_REASONING_EFFORT",
  },
};

const USER_PARSE_ERROR =
  "We could not read that menu. Try uploading a clearer photo or PDF.";
const USER_CHAT_ERROR =
  "I could not answer that just now. Please try again in a moment.";
const chatJobCleanupDelayMs = 15 * 60 * 1000;
const openAIParseMaxAttempts = 3;
const openAIRetryBaseDelayMs = 1250;
const storageLookupMaxAttempts = 3;
const maxVisualActionSteps = 3;
const visualUncertaintyWarning =
  "Some menu text may be missing or unclear because the photo is hard to read.";

const MENU_EXTRACTION_PROMPT = `You are a menu extraction assistant. Extract every item from this restaurant menu image and organize it by category exactly as it appears. For each item include:
- name (exactly as written)
- description (if present)
- price (as a string, e.g. "$12.99" or "Market Price"; null if absent)
- allergens: infer from ingredient descriptions. Use only these values: ["gluten", "dairy", "nuts", "shellfish", "eggs", "soy", "fish"]
- dietaryTags: infer from descriptions. Use only these values: ["vegetarian", "vegan", "gf", "halal", "kosher"]
- spiceLevel: if mentioned, one of ["mild", "medium", "hot", "extra-hot"]; otherwise null

Also assess whether the menu source is visually usable:
- visualAssessment.status must be "complete" when the visible menu appears readable and no important menu area appears cut off.
- Use "partial" when useful menu text can be extracted, but this source appears cropped, blurry in places, affected by glare, angled, folded, out of focus, or partially obscured.
- Use "insufficient" when there is not enough readable menu text to create a useful accessible menu.
- Do not call a source "partial" only because it appears to be one page from a multi-page menu. The app may already be processing several uploaded pages from the same menu.
- Judge the primary menu page or panel for this upload. If another page, facing page, folded panel, or neighboring page is only partly visible at the edge of the photo, ignore that adjacent page unless it blocks text on the primary page.
- visualAssessment.note must be null for "complete". For "partial" or "insufficient", write one short, calm, user-facing paragraph explaining only the specific parts that are hard to see. Use plain directions for older or low-vision users.
- visualAssessment.issues must list specific visual problems, for example "right side is cut off", "prices are blurry", "fold hides the center", or "glare hides the lower left corner".
- visualAssessment.actionSteps must give concrete retake/upload steps for "partial" or "insufficient", such as "Move the camera farther back so all four edges are visible", "Retake the photo with the right edge inside the frame", or "Flatten the menu and retake the photo". Do not say "move left" or "move right" without naming which page edge needs to be inside the frame. Use an empty array for "complete".
- Keep action steps short and non-overlapping. Prefer 1 to 3 steps that a person can follow one at a time. Do not include several versions of "make the whole page visible" or several versions of "flatten the menu."
- Do not speculate with phrases like "might be a multi-page menu" or "looks like part of a multi-page menu." Ask for another page only when there is clear visual evidence that a page is missing from the uploaded set.

The source may be a printed menu, a photo of an overhead counter menu board, a drive-through or fast-food board, one page from an uploaded menu set, or a browser-printed PDF of a website menu. Preserve combo names, size names, modifier groups, price columns, and source/category ordering. Ignore browser print headers, footers, navigation links, cookie banners, and unrelated website chrome. If this source appears to continue a category from a previous source, use that same category name rather than inventing a new continuation label. Use warnings only for menu facts that are uncertain after extraction, not for retake advice already covered by visualAssessment. If text is blurry, cut off, hidden by glare, or uncertain, prefer visualAssessment.note/issues/actionSteps; add at most one short warning only when menu content may be missing or uncertain. If the source is insufficient, return an empty categories array and explain how to improve the upload in visualAssessment.

Return ONLY valid JSON matching the schema. Do not include any commentary.`;

const MENU_CHAT_PROMPT = `You are a helpful assistant for a restaurant menu. Answer questions about the menu items, ingredients, allergens, dietary options, and prices based on the menu provided. Be concise and friendly.

For explicit menu facts like prices, ingredients, allergens, dietary tags, and availability, use only what the menu says. Do not invent facts.

For broader nutrition-style questions such as low glycemic index, blood sugar, low carb, lighter options, protein, sodium, fat, cholesterol, or calories, you may make careful food-pattern inferences from the item names, descriptions, categories, and common food knowledge. Always make the uncertainty clear. Do not give medical advice, exact nutrition numbers, or exact glycemic-index claims unless the menu explicitly provides them. Avoid stock disclaimers like "ensure to consult." If a medical caveat is useful, say it plainly: "For personalized medical advice, check with a healthcare professional."

Format answers as plain text. Use short paragraphs or simple numbered lists when useful, but do not use Markdown syntax such as **bold**, headings, tables, or code blocks.`;

const NUTRITION_ANALYSIS_PROMPT = `You are helping classify restaurant menu items for a nutrition-style question. Use the visible menu text plus common food knowledge. Return likely helpful menu items, maybe items, and likely less ideal items.

For low glycemic index, blood sugar, diabetes, low carb, and keto questions, generally prefer protein-forward, vegetable-forward, unsweetened, and non-breaded items. Be cautious with rice, bread, pasta, tortillas, potatoes, sugary sauces, desserts, sweet drinks, and fried breaded items.

Do not claim exact nutrition, calories, carbs, or glycemic index unless the menu explicitly states them. Keep reasons brief and tied to item names/descriptions. Return only valid JSON.`;

const parsedMenuSchema = {
  type: "object",
  additionalProperties: false,
  required: ["warnings", "visualAssessment", "categories"],
  properties: {
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    visualAssessment: {
      type: "object",
      additionalProperties: false,
      required: ["status", "note", "issues", "actionSteps"],
      properties: {
        status: {
          type: "string",
          enum: ["complete", "partial", "insufficient"],
        },
        note: { type: ["string", "null"] },
        issues: {
          type: "array",
          items: { type: "string" },
        },
        actionSteps: {
          type: "array",
          items: { type: "string" },
        },
      },
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
  }),
);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown parsing error.";
}

function shortenForLog(value: string, maxLength = 1200) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableOpenAIStatus(status: number) {
  return [408, 409, 429, 500, 502, 503, 504].includes(status);
}

class OpenAIRequestError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAIRequestError";
    this.status = status;
    this.retryable = isRetryableOpenAIStatus(status);
  }
}

function isRetryableError(error: unknown) {
  if (error instanceof OpenAIRequestError) {
    return error.retryable;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    return ["AbortError", "TimeoutError"].includes(error.name);
  }

  return false;
}

async function fetchOpenAIWithRetry({
  body,
  label,
  onRetry,
}: {
  body: OpenAIRequestBody;
  label: string;
  onRetry?: (args: {
    attempt: number;
    nextAttempt: number;
    maxAttempts: number;
    errorMessage: string;
  }) => Promise<void>;
}) {
  const apiKey = getOpenAIKey();
  const requestBody = JSON.stringify(body);

  for (let attempt = 1; attempt <= openAIParseMaxAttempts; attempt += 1) {
    const startedAt = Date.now();

    try {
      console.info("[menu-parse] OpenAI request started", {
        label,
        attempt,
        maxAttempts: openAIParseMaxAttempts,
      });

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (!response.ok) {
        const details = shortenForLog(await response.text());
        throw new OpenAIRequestError(
          `OpenAI menu parsing failed (${response.status}): ${details}`,
          response.status,
        );
      }

      console.info("[menu-parse] OpenAI request completed", {
        label,
        attempt,
        durationMs: Date.now() - startedAt,
      });

      return response;
    } catch (error) {
      const errorMessage = shortenForLog(getErrorMessage(error));
      const retryable = isRetryableError(error);

      console.warn("[menu-parse] OpenAI request failed", {
        label,
        attempt,
        maxAttempts: openAIParseMaxAttempts,
        retryable,
        durationMs: Date.now() - startedAt,
        errorMessage,
      });

      if (!retryable || attempt === openAIParseMaxAttempts) {
        throw error;
      }

      await onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: openAIParseMaxAttempts,
        errorMessage,
      });

      await sleep(openAIRetryBaseDelayMs * attempt);
    }
  }

  throw new Error(
    "OpenAI menu parsing failed before a request could complete.",
  );
}

function getOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return apiKey;
}

function isReasoningEffort(value: string): value is OpenAIReasoningEffort {
  return ["none", "low", "medium", "high", "xhigh"].includes(value);
}

function isGpt5Model(model: string) {
  return model.startsWith("gpt-5");
}

function getOpenAIModelConfig(useCase: OpenAIUseCase) {
  const config = OPENAI_MODEL_CONFIG[useCase];
  const model = process.env[config.modelEnv] ?? config.defaultModel;
  const envReasoningEffort = process.env[config.reasoningEnv];
  const reasoningEffort =
    envReasoningEffort && isReasoningEffort(envReasoningEffort)
      ? envReasoningEffort
      : config.defaultReasoningEffort;

  return {
    model,
    reasoningEffort,
    textVerbosity: config.textVerbosity,
  };
}

function buildOpenAIRequestBody(
  useCase: OpenAIUseCase,
  body: OpenAIRequestBody,
) {
  const config = getOpenAIModelConfig(useCase);
  const requestBody: OpenAIRequestBody = {
    ...body,
    model: config.model,
  };

  if (!isGpt5Model(config.model)) {
    return requestBody;
  }

  requestBody.reasoning = { effort: config.reasoningEffort };

  if (config.textVerbosity) {
    requestBody.text = {
      ...(body.text ?? {}),
      verbosity: config.textVerbosity,
    };
  }

  return requestBody;
}

async function getMenuParseInputs(
  blob: Blob,
  sourceType: SourceType,
  inputNumber = 1,
) {
  const contentType =
    blob.type || (sourceType === "pdf" ? "application/pdf" : "image/jpeg");
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
  sourceType: SourceType,
) {
  const inputs: MenuParseInput[] = [];

  for (const [index, storageId] of storageIds.entries()) {
    const storedFile = await getStoredFileWithRetry(
      ctx,
      storageId,
      `upload ${index + 1}`,
    );

    inputs.push(
      ...(await getMenuParseInputs(storedFile, sourceType, index + 1)),
    );
  }

  return inputs;
}

async function getStoredFileWithRetry(
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  label: string,
) {
  for (let attempt = 1; attempt <= storageLookupMaxAttempts; attempt += 1) {
    const storedFile = await ctx.storage.get(storageId);

    if (storedFile) {
      return storedFile;
    }

    console.warn("[menu-parse] storage file unavailable", {
      label,
      attempt,
      maxAttempts: storageLookupMaxAttempts,
      storageId,
    });

    if (attempt < storageLookupMaxAttempts) {
      await sleep(500 * attempt);
    }
  }

  throw new Error(
    `Uploaded file could not be found in Convex storage (${label}).`,
  );
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

  for (const category of parsedMenus.flatMap(
    (parsedMenu) => parsedMenu.categories,
  )) {
    const previousCategory = categories[categories.length - 1];

    if (
      previousCategory &&
      normalizeCategoryName(previousCategory.name) ===
        normalizeCategoryName(category.name)
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
    warnings: sanitizeWarnings(
      parsedMenus.flatMap((parsedMenu) => parsedMenu.warnings),
    ),
    visualAssessment: aggregateVisualAssessments(
      parsedMenus.map((parsedMenu, index) => ({
        label: `upload ${index + 1}`,
        parsedMenu,
      })),
    ),
    categories,
  };
}

function hasMeaningfulMenuData(parsedMenu: ParsedMenu) {
  return parsedMenu.categories.some((category) => category.items.length > 0);
}

function normalizeTextList(items: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();

    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

function removeMultiPageSpeculation(text: string) {
  return text
    .replace(
      /(?:,?\s+(?:and|but)\s+)?\b(?:it\s+)?(?:looks|appears|seems)\s+like\s+(?:it\s+)?(?:might|may|could)\s+be\s+(?:part\s+of\s+)?(?:a\s+)?multi[- ]page menu\.?/gi,
      "",
    )
    .replace(
      /(?:,?\s+(?:and|but)\s+)?\b(?:it\s+)?(?:might|may|could)\s+be\s+(?:part\s+of\s+)?(?:a\s+)?multi[- ]page menu\.?/gi,
      "",
    )
    .replace(
      /(?:,?\s+(?:and|but)\s+)?\blikely\s+to\s+be\s+one\s+page\s+of\s+(?:a\s+)?multi[- ]page menu\.?/gi,
      "",
    )
    .replace(
      /(?:,?\s+(?:and|but)\s+)?\bone\s+page\s+of\s+(?:a\s+)?multi[- ]page menu\.?/gi,
      "",
    )
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/(?:,\s*(?:and|but)|\s+(?:and|but))$/i, "")
    .replace(/\s+([.?!])$/g, "$1")
    .trim();
}

function isGenericMissingPageStep(step: string) {
  return /\b(?:upload|add|include)\b.*\b(?:next|another|other|remaining|rest)\b.*\bpages?\b/i.test(
    step,
  );
}

function normalizeActionStepText(step: string) {
  const cleaned = removeMultiPageSpeculation(step);
  const lowerStep = cleaned.toLowerCase();

  if (/\b(?:fold|folded|unfold|unfolded|flatten|flat)\b/.test(lowerStep)) {
    return "Flatten the menu and retake the photo.";
  }

  if (/\b(?:glare|shadow|shadows)\b/.test(lowerStep)) {
    return "Move away from glare or shadows and retake the photo.";
  }

  if (/\bright (?:side|edge)\b/.test(lowerStep)) {
    return "Retake the photo with the right edge inside the frame.";
  }

  if (/\bleft (?:side|edge)\b/.test(lowerStep)) {
    return "Retake the photo with the left edge inside the frame.";
  }

  if (/\btop edge\b/.test(lowerStep)) {
    return "Retake the photo with the top edge inside the frame.";
  }

  if (/\bbottom edge\b/.test(lowerStep)) {
    return "Retake the photo with the bottom edge inside the frame.";
  }

  if (
    /\bbottom\b.*\b(?:text|image|photo|page|frame|obscured|cut off|hidden)\b/.test(
      lowerStep,
    ) ||
    /\b(?:text|image|photo|page|frame|obscured|cut off|hidden)\b.*\bbottom\b/.test(
      lowerStep,
    )
  ) {
    return "Retake the photo with the bottom edge inside the frame.";
  }

  if (/\bmove\b.*\bcamera\b.*\b(?:left|right|up|down)\b/.test(lowerStep)) {
    return "Move the camera farther back so all four edges are visible.";
  }

  if (
    /\b(?:farther back|all four edges|all edges|entire menu|entire page|whole menu|whole page|full menu|full page|fully visible|inside the frame|capture all|capture the whole|capture the entire|fully captured)\b/.test(
      lowerStep,
    )
  ) {
    return "Move the camera farther back so all four edges are visible.";
  }

  if (/\b(?:focus|blurry|steady)\b/.test(lowerStep)) {
    return "Hold the camera steady so the menu is in focus.";
  }

  return cleaned;
}

function normalizeWarningText(warning: string) {
  const cleaned = removeMultiPageSpeculation(warning);
  const lowerWarning = cleaned.toLowerCase();

  if (!cleaned) {
    return null;
  }

  if (
    /\b(?:retake|move the camera|lay the menu|flatten|ensure|make sure|upload)\b/.test(
      lowerWarning,
    )
  ) {
    return null;
  }

  if (
    /\b(?:blurry|blur|cut off|cropped|obscured|hidden|glare|shadow|edge|edges|missing|unclear|hard to read|additional information|description|descriptions)\b/.test(
      lowerWarning,
    )
  ) {
    return visualUncertaintyWarning;
  }

  return cleaned;
}

function sanitizeWarnings(warnings: string[]) {
  return normalizeTextList(
    warnings
      .map(normalizeWarningText)
      .filter((warning): warning is string => Boolean(warning)),
  );
}

function pruneRedundantActionSteps(steps: string[]) {
  const hasSpecificEdgeStep = steps.some((step) =>
    /^Retake the photo with the (?:right|left|top|bottom) edge inside the frame\.$/.test(
      step,
    ),
  );

  return steps
    .filter(
      (step) =>
        !hasSpecificEdgeStep ||
        step !== "Move the camera farther back so all four edges are visible.",
    )
    .slice(0, maxVisualActionSteps);
}

function formatPageLabel(label: string) {
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : "Upload";
}

function labelActionStep(label: string, step: string, includeLabel: boolean) {
  if (!includeLabel) {
    return step;
  }

  const formattedLabel = formatPageLabel(label);
  const labelPattern = new RegExp(
    `^${formattedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`,
    "i",
  );

  if (labelPattern.test(step)) {
    return step;
  }

  return `${formattedLabel}: ${step}`;
}

function formatLabelList(labels: string[]) {
  const formattedLabels = labels.map(formatPageLabel);

  if (formattedLabels.length <= 1) {
    return formattedLabels[0] ?? "Upload";
  }

  if (formattedLabels.length === 2) {
    return `${formattedLabels[0]} and ${formattedLabels[1]}`;
  }

  return `${formattedLabels.slice(0, -1).join(", ")}, and ${
    formattedLabels[formattedLabels.length - 1]
  }`;
}

function aggregateActionStepsForPages(
  problemPages: ParsedMenuPage[],
  includeLabels: boolean,
) {
  const stepLabels = new Map<string, string[]>();

  for (const page of problemPages) {
    for (const step of page.parsedMenu.visualAssessment.actionSteps) {
      const labels = stepLabels.get(step) ?? [];

      if (!includeLabels) {
        if (!stepLabels.has(step)) {
          stepLabels.set(step, []);
        }
        continue;
      }

      if (!labels.includes(page.label)) {
        labels.push(page.label);
      }

      stepLabels.set(step, labels);
    }
  }

  return pruneRedundantActionSteps([...stepLabels.keys()]).map((step) => {
    const labels = stepLabels.get(step) ?? [];

    return includeLabels
      ? labelActionStep(formatLabelList(labels), step, true)
      : step;
  });
}

function sanitizeVisualAssessment(
  assessment: VisualAssessment,
  options: { suppressGenericMissingPageSteps: boolean },
): VisualAssessment {
  if (assessment.status === "complete") {
    return {
      status: "complete",
      note: null,
      issues: [],
      actionSteps: [],
    };
  }

  const note = assessment.note
    ? removeMultiPageSpeculation(assessment.note)
    : assessment.note;
  const issues = normalizeTextList(
    assessment.issues
      .map(removeMultiPageSpeculation)
      .filter((issue) => issue.length > 0),
  );
  const actionSteps = pruneRedundantActionSteps(
    normalizeTextList(
      assessment.actionSteps
        .map(normalizeActionStepText)
        .filter((step) => step.length > 0)
        .filter(
          (step) =>
            !options.suppressGenericMissingPageSteps ||
            !isGenericMissingPageStep(step),
        ),
    ),
  );

  if (
    assessment.status === "partial" &&
    !note &&
    !issues.length &&
    !actionSteps.length
  ) {
    return {
      status: "complete",
      note: null,
      issues: [],
      actionSteps: [],
    };
  }

  return {
    ...assessment,
    note,
    issues,
    actionSteps,
  };
}

function sanitizeParsedMenu(
  parsedMenu: ParsedMenu,
  options: { suppressGenericMissingPageSteps: boolean },
): ParsedMenu {
  return {
    ...parsedMenu,
    warnings: sanitizeWarnings(parsedMenu.warnings),
    visualAssessment: sanitizeVisualAssessment(
      parsedMenu.visualAssessment,
      options,
    ),
  };
}

function fallbackAssessmentForInsufficientInput(
  label: string,
): VisualAssessment {
  return {
    status: "insufficient",
    note: `I could not read enough menu text from ${label} to build an accessible menu.`,
    issues: ["Not enough readable menu text"],
    actionSteps: [
      "Retake the photo with the whole menu inside the frame.",
      "Hold the camera steady and avoid glare or shadows.",
      "Upload a clearer image or PDF if one is available.",
    ],
  };
}

function aggregateVisualAssessments(
  parsedPages: ParsedMenuPage[],
): VisualAssessment {
  const assessments = parsedPages.map(
    (page) => page.parsedMenu.visualAssessment,
  );
  const hasInsufficient = assessments.some(
    (assessment) => assessment.status === "insufficient",
  );
  const hasPartial = assessments.some(
    (assessment) => assessment.status === "partial",
  );
  const usablePageCount = parsedPages.filter((page) =>
    hasMeaningfulMenuData(page.parsedMenu),
  ).length;

  if (usablePageCount === 0) {
    const problemPages = parsedPages.filter(
      (page) => page.parsedMenu.visualAssessment.status !== "complete",
    );
    const firstAssessment =
      problemPages[0]?.parsedMenu.visualAssessment ??
      fallbackAssessmentForInsufficientInput("the upload");
    const issues = normalizeTextList(
      problemPages.flatMap((page) =>
        page.parsedMenu.visualAssessment.issues.map(
          (issue) => `${page.label}: ${issue}`,
        ),
      ),
    );
    const actionSteps = aggregateActionStepsForPages(
      problemPages,
      parsedPages.length > 1,
    );

    return {
      status: "insufficient",
      note:
        firstAssessment.note ??
        "I could not read enough menu text to build an accessible menu.",
      issues: issues.length ? issues : firstAssessment.issues,
      actionSteps: actionSteps.length
        ? actionSteps
        : firstAssessment.actionSteps,
    };
  }

  if (!hasInsufficient && !hasPartial) {
    return {
      status: "complete",
      note: null,
      issues: [],
      actionSteps: [],
    };
  }

  const problemPages = parsedPages.filter(
    (page) => page.parsedMenu.visualAssessment.status !== "complete",
  );
  const issues = normalizeTextList(
    problemPages.flatMap((page) =>
      page.parsedMenu.visualAssessment.issues.map(
        (issue) => `${page.label}: ${issue}`,
      ),
    ),
  );
  const actionSteps = aggregateActionStepsForPages(
    problemPages,
    parsedPages.length > 1,
  );

  const issueSummary = problemPages
    .map((page) => {
      const note = page.parsedMenu.visualAssessment.note;
      return note ? `${page.label}: ${note}` : page.label;
    })
    .join(" ");

  return {
    status: "partial",
    note:
      issueSummary ||
      "Some of the menu could be read, but part of the upload appears incomplete.",
    issues,
    actionSteps,
  };
}

function normalizeParsedMenuPages(parsedPages: ParsedMenuPage[]): ParsedMenu {
  const usablePages = parsedPages.filter((page) =>
    hasMeaningfulMenuData(page.parsedMenu),
  );
  const normalizedMenu = normalizeParsedMenu(
    usablePages.map((page) => page.parsedMenu),
  );

  return {
    ...normalizedMenu,
    warnings: normalizeTextList(
      parsedPages.flatMap((page) => page.parsedMenu.warnings),
    ),
    visualAssessment: aggregateVisualAssessments(parsedPages),
  };
}

function getVisualAssessmentError(assessment: VisualAssessment) {
  return assessment.note ?? USER_PARSE_ERROR;
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
  extractionChecklist?: string | null,
  pageContext?: ParsePageContext,
  onRetry?: (args: {
    attempt: number;
    nextAttempt: number;
    maxAttempts: number;
    errorMessage: string;
  }) => Promise<void>,
) {
  const checklistText = extractionChecklist
    ? `\n\nBefore returning JSON, use this menu-section checklist from a first pass over the same PDF. The final JSON should cover all relevant sections from this checklist, not just the first section:\n${extractionChecklist}`
    : "";
  const pageContextText =
    pageContext && pageContext.totalInputs > 1
      ? `This upload is ${input.label} of ${pageContext.totalInputs} uploaded menu images. The other uploaded images may contain other pages from the same menu. For visualAssessment, judge only the primary menu page or panel centered in ${input.label}. If another page, facing page, folded panel, or neighboring page is partly visible at the edge, ignore that adjacent page unless it blocks text on ${input.label}. If a retake is needed, each action step must identify ${input.label} and name the specific edge or problem.`
      : `This upload is ${input.label}. For visualAssessment, judge the primary menu page or panel in this upload.`;

  const response = await fetchOpenAIWithRetry({
    label: `parse ${input.label}`,
    onRetry,
    body: buildOpenAIRequestBody("parse", {
      instructions: MENU_EXTRACTION_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `${pageContextText}\n\nExtract the complete menu from ${input.label}. For PDFs, read all pages in that PDF and ignore browser print headers, footers, navigation, cookie banners, and unrelated website chrome. Do not stop after the first category or first page. Include breakfast, lunch, dinner, sandwiches, meats, sides, tacos, kids, desserts, drinks, and any other menu sections when present.${checklistText}`,
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

  const json = await response.json();
  return JSON.parse(extractOutputText(json)) as ParsedMenu;
}

async function inventoryMenuInputWithOpenAI(
  input: Extract<MenuParseInput, { kind: "pdf" }>,
) {
  try {
    const response = await fetchOpenAIWithRetry({
      label: `inventory ${input.label}`,
      body: buildOpenAIRequestBody("parse", {
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

    const json = await response.json();

    return extractOutputText(json).trim().slice(0, 4000);
  } catch (error) {
    console.warn("[menu-parse] PDF inventory pass skipped", {
      label: input.label,
      errorMessage: shortenForLog(getErrorMessage(error)),
    });
    return null;
  }
}

function formatInputCount(inputCount: number) {
  return `${inputCount} menu upload${inputCount === 1 ? "" : "s"}`;
}

async function parseInputsWithProgress(
  ctx: ActionCtx,
  menuId: Id<"menus">,
  inputs: MenuParseInput[],
) {
  const totalInputs = inputs.length;
  const parsedPages: ParsedMenuPage[] = [];
  let retryCount = 0;

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

    const parsedMenu = await parseMenuInputWithOpenAI(
      input,
      extractionChecklist,
      { inputNumber, totalInputs },
      async ({ nextAttempt, maxAttempts, errorMessage }) => {
        retryCount += 1;
        await ctx.runMutation(internal.menus.updateParseJob, {
          menuId,
          status: "extracting",
          message: `AI reading hit a temporary snag on ${input.label}. Retrying ${nextAttempt} of ${maxAttempts}.`,
          lastInternalErrorMessage: errorMessage,
          retryCount,
          totalPages: totalInputs,
          currentPage: inputNumber,
          completedPages: index,
        });
      },
    );

    parsedPages.push({
      label: input.label,
      parsedMenu: sanitizeParsedMenu(parsedMenu, {
        suppressGenericMissingPageSteps: totalInputs > 1,
      }),
    });

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
    question,
  );
}

function buildNutritionAnalysisContext(analysis: NutritionAnalysis) {
  const formatItems = (
    label: string,
    items: Array<{ itemId: string; reason: string }>,
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
  analysis: NutritionAnalysis,
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
  },
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildOpenAIRequestBody("chat", {
        instructions: MENU_CHAT_PROMPT,
        input: buildChatInput(args.context, args.extraContext),
        stream: true,
      }),
    ),
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
    body: JSON.stringify(
      buildOpenAIRequestBody("chat", {
        instructions: MENU_CHAT_PROMPT,
        input: buildChatInput(context, extraContext),
      }),
    ),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI menu chat failed: ${details}`);
  }

  const json = await response.json();
  return extractOutputText(json).trim();
}

async function analyzeNutritionQuestion(
  context: ChatContext,
  question: string,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      buildOpenAIRequestBody("nutrition", {
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
    ),
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
        item.dietaryTags.length
          ? `dietary tags ${item.dietaryTags.join(", ")}`
          : null,
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
    body: JSON.stringify(
      buildOpenAIRequestBody("reference", {
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
    ),
  });

  if (!response.ok) {
    return [];
  }

  const json = await response.json();
  const parsed = JSON.parse(extractOutputText(json)) as ReferencedItems;
  const validIds = new Set(context.items.map((item) => item.id));

  return parsed.itemIds.filter((itemId): itemId is Id<"menuItems"> =>
    validIds.has(itemId as Id<"menuItems">),
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

      console.info("[menu-parse] parseMenu started", {
        menuId: args.menuId,
        sourceType: args.sourceType,
      });

      const storedFile = await getStoredFileWithRetry(
        ctx,
        args.storageId as Id<"_storage">,
        "upload 1",
      );

      const parseInputs = await getMenuParseInputs(storedFile, args.sourceType);

      if (parseInputs.length === 0) {
        throw new Error("No menu uploads were available for parsing.");
      }

      const parsedPages = await parseInputsWithProgress(
        ctx,
        args.menuId,
        parseInputs,
      );
      const parsedMenu = normalizeParsedMenuPages(parsedPages);

      if (!hasMeaningfulMenuData(parsedMenu)) {
        await ctx.runMutation(internal.menus.markParseFailed, {
          menuId: args.menuId,
          errorMessage: getVisualAssessmentError(parsedMenu.visualAssessment),
          visualAssessment: parsedMenu.visualAssessment,
        });
        return;
      }

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
        parsedMenu,
      });
    } catch (error) {
      console.error("[menu-parse] parseMenu failed", {
        menuId: args.menuId,
        sourceType: args.sourceType,
        errorMessage: shortenForLog(getErrorMessage(error)),
      });
      await ctx.runMutation(internal.menus.markParseFailed, {
        menuId: args.menuId,
        errorMessage: USER_PARSE_ERROR,
        lastInternalErrorMessage: shortenForLog(getErrorMessage(error)),
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
      console.info("[menu-parse] parseMenuUploads started", {
        menuId: args.menuId,
        sourceType: args.sourceType,
        uploadCount: args.storageIds.length,
      });

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
        args.sourceType,
      );

      if (parseInputs.length === 0) {
        throw new Error("No menu uploads were available for parsing.");
      }

      const parsedPages = await parseInputsWithProgress(
        ctx,
        args.menuId,
        parseInputs,
      );
      const parsedMenu = normalizeParsedMenuPages(parsedPages);

      if (!hasMeaningfulMenuData(parsedMenu)) {
        await ctx.runMutation(internal.menus.markParseFailed, {
          menuId: args.menuId,
          errorMessage: getVisualAssessmentError(parsedMenu.visualAssessment),
          visualAssessment: parsedMenu.visualAssessment,
        });
        return;
      }

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
        parsedMenu,
      });
    } catch (error) {
      console.error("[menu-parse] parseMenuUploads failed", {
        menuId: args.menuId,
        sourceType: args.sourceType,
        uploadCount: args.storageIds.length,
        errorMessage: shortenForLog(getErrorMessage(error)),
      });
      await ctx.runMutation(internal.menus.markParseFailed, {
        menuId: args.menuId,
        errorMessage: USER_PARSE_ERROR,
        lastInternalErrorMessage: shortenForLog(getErrorMessage(error)),
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
        { jobId: args.jobId },
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

        nutritionAnalysis = await analyzeNutritionQuestion(
          context,
          job.question,
        );
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
      await ctx.scheduler.runAfter(
        chatJobCleanupDelayMs,
        internal.chat.cleanupAnonymousChatJob,
        {
          jobId: args.jobId,
        },
      );
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

    const baseContext = (await ctx.runQuery(
      internal.chat.getEphemeralMenuChatContext,
      {
        menuId: args.menuId,
        anonymousClientId: args.anonymousClientId,
      },
    )) as ChatContext;
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
