#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OUT = `/tmp/menu-garden-openai-eval-${Date.now()}.json`;
const DEFAULT_MODELS = [
  { label: "baseline", model: "gpt-4o-2024-08-06", reasoningEffort: null },
  { label: "candidate", model: "gpt-5.4", reasoningEffort: "low" },
];
const FLAGSHIP_MODEL = {
  label: "flagship",
  model: "gpt-5.5",
  reasoningEffort: "low",
};

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

function parseArgs(argv) {
  const files = [];
  const models = [...DEFAULT_MODELS];
  let out = DEFAULT_OUT;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--include-flagship") {
      models.push(FLAGSHIP_MODEL);
      continue;
    }

    if (arg === "--out") {
      out = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--model") {
      const [label, model, reasoningEffort = "low"] = (
        argv[index + 1] ?? ""
      ).split(":");

      if (!label || !model) {
        throw new Error("--model expects label:model[:reasoningEffort].");
      }

      models.push({
        label,
        model,
        reasoningEffort: model.startsWith("gpt-5") ? reasoningEffort : null,
      });
      index += 1;
      continue;
    }

    files.push(resolve(arg));
  }

  if (!out) {
    throw new Error("--out requires a path.");
  }

  if (files.length === 0) {
    throw new Error("Pass at least one image or PDF path.");
  }

  return { files, models, out: resolve(out) };
}

function printUsage() {
  console.log(`Usage:
  OPENAI_API_KEY=... node scripts/eval-openai-menu-models.mjs [options] <file...>

Options:
  --include-flagship           Also test gpt-5.5.
  --model label:model[:effort] Add another model candidate.
  --out <path>                 Write detailed JSON to this path. Defaults to /tmp.

Examples:
  node scripts/eval-openai-menu-models.mjs --include-flagship ~/Downloads/vm1.png ~/Downloads/vm2.jpg
  node scripts/eval-openai-menu-models.mjs --model fast:gpt-5.4-mini:none ./menu.jpg`);
}

function getMimeType(filePath) {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    return "application/pdf";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return "image/jpeg";
}

function getInputContent(filePath, base64) {
  const mimeType = getMimeType(filePath);

  if (mimeType === "application/pdf") {
    return {
      type: "input_file",
      filename: filePath.split("/").at(-1) ?? "menu.pdf",
      file_data: `data:${mimeType};base64,${base64}`,
    };
  }

  return {
    type: "input_image",
    image_url: `data:${mimeType};base64,${base64}`,
    detail: "high",
  };
}

function extractOutputText(response) {
  for (const item of response.output ?? []) {
    for (const contentItem of item.content ?? []) {
      if (typeof contentItem.text === "string") {
        return contentItem.text;
      }
    }
  }

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  throw new Error("OpenAI did not return parseable output text.");
}

function countItems(parsedMenu) {
  return parsedMenu.categories.reduce(
    (total, category) => total + category.items.length,
    0,
  );
}

function summarizeParsedMenu(parsedMenu) {
  return {
    categoryCount: parsedMenu.categories.length,
    itemCount: countItems(parsedMenu),
    warningCount: parsedMenu.warnings.length,
    visualAssessmentStatus: parsedMenu.visualAssessment.status,
  };
}

function buildRequestBody({ filePath, modelConfig, base64 }) {
  const body = {
    model: modelConfig.model,
    instructions: MENU_EXTRACTION_PROMPT,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Extract the complete menu from ${filePath}. For PDFs, read all pages in that PDF and ignore browser print headers, footers, navigation, cookie banners, and unrelated website chrome. Do not stop after the first category or first page.`,
          },
          getInputContent(filePath, base64),
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
  };

  if (modelConfig.model.startsWith("gpt-5") && modelConfig.reasoningEffort) {
    body.reasoning = { effort: modelConfig.reasoningEffort };
  }

  return body;
}

async function runModelOnFile({ apiKey, filePath, modelConfig }) {
  const fileBuffer = await readFile(filePath);
  const base64 = fileBuffer.toString("base64");
  const startedAt = performance.now();

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRequestBody({ filePath, modelConfig, base64 })),
    });
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      return {
        filePath,
        label: modelConfig.label,
        model: modelConfig.model,
        ok: false,
        latencyMs,
        error: await response.text(),
      };
    }

    const rawResponse = await response.json();
    const parsedMenu = JSON.parse(extractOutputText(rawResponse));

    return {
      filePath,
      label: modelConfig.label,
      model: modelConfig.model,
      ok: true,
      latencyMs,
      usage: rawResponse.usage ?? null,
      summary: summarizeParsedMenu(parsedMenu),
      parsedMenu,
    };
  } catch (error) {
    return {
      filePath,
      label: modelConfig.label,
      model: modelConfig.model,
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatTable(results) {
  return results.map((result) => ({
    file: result.filePath.split("/").at(-1),
    label: result.label,
    model: result.model,
    ok: result.ok,
    ms: result.latencyMs,
    categories: result.summary?.categoryCount ?? "-",
    items: result.summary?.itemCount ?? "-",
    visual: result.summary?.visualAssessmentStatus ?? "-",
    warnings: result.summary?.warningCount ?? "-",
  }));
}

async function main() {
  const { files, models, out } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  const results = [];

  for (const filePath of files) {
    for (const modelConfig of models) {
      console.log(
        `Evaluating ${filePath} with ${modelConfig.label} (${modelConfig.model})...`,
      );
      results.push(await runModelOnFile({ apiKey, filePath, modelConfig }));
    }
  }

  await mkdir(dirname(out), { recursive: true });
  await writeFile(
    out,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        files,
        models,
        results,
      },
      null,
      2,
    ),
  );

  console.table(formatTable(results));
  console.log(`Detailed eval JSON written to ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
