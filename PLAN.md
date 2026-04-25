# Menu Garden — Codex Build Prompt

You are helping build **Menu Garden**, an accessibility-first web and mobile app that converts inaccessible restaurant menus into structured, screen-reader-friendly digital menus. Blind and low-vision users can upload a menu (PDF or photo), ask natural-language questions about it, and discover accessible menus near them by ZIP code. Restaurant owners get a portal to publish and manage their accessible menus.

---

## Tech Stack

Use exactly this stack — do not substitute:

- **Monorepo**: Turborepo. Start from the official Convex monorepo template: https://www.convex.dev/templates/monorepo
- **Web app**: Next.js (App Router) at `apps/web/`
- **Mobile app**: Expo (SDK 55+, New Architecture) at `apps/mobile/`
- **Cross-platform navigation**: Solito v5 (web-first approach — no react-native-web on the Next.js side)
- **Backend**: Convex (database, file storage, real-time queries, actions for AI calls)
- **Auth**: Clerk (works in both Next.js and Expo; two roles: `consumer` and `restaurant_owner`)
- **AI — Menu Parsing**: OpenAI GPT-4o Vision API with Structured Outputs
- **AI — Menu Q&A Chat**: OpenAI GPT-4o Chat Completions with streaming
- **Location**: Google Geocoding API (ZIP → lat/lng), Google Places API (nearby restaurants)
- **PDF handling**: Convert PDF pages to images server-side before sending to Vision API
- **Language**: TypeScript throughout
- **Styling**: TailwindCSS (web), NativeWind (mobile)

---

## Monorepo Folder Structure

Scaffold this structure exactly:

```
menu-garden/
├── apps/
│   ├── web/                          # Next.js App Router
│   │   └── app/
│   │       ├── (consumer)/           # Route group: browse, search, menu view, chat
│   │       │   ├── page.tsx          # Home / nearby search
│   │       │   ├── menu/[slug]/      # Public accessible menu viewer
│   │       │   └── chat/[id]/        # Menu Q&A chat
│   │       ├── (restaurant)/         # Route group: owner dashboard
│   │       │   ├── dashboard/        # Menu management list
│   │       │   ├── upload/           # Upload + parse new menu
│   │       │   └── menu/[id]/edit/   # Review and edit parsed menu
│   │       └── api/
│   │           ├── menus/parse/      # POST: trigger menu parsing pipeline
│   │           ├── menus/[id]/chat/  # POST: forward chat message, return stream
│   │           └── restaurants/nearby/ # GET: ZIP → nearby restaurants
│   └── mobile/                       # Expo Router
│       └── app/
│           ├── (tabs)/
│           │   ├── index.tsx         # Nearby tab
│           │   ├── scan.tsx          # Camera scan tab
│           │   └── saved.tsx         # Saved menus tab
│           ├── menu/[id].tsx         # Menu detail view
│           └── chat/[id].tsx         # Menu Q&A chat
├── packages/
│   ├── shared/
│   │   ├── convex/                   # Convex schema, queries, mutations, actions
│   │   │   ├── schema.ts
│   │   │   ├── restaurants.ts
│   │   │   ├── menus.ts
│   │   │   ├── menuItems.ts
│   │   │   ├── chat.ts
│   │   │   ├── ai.ts                 # Convex actions: parsing + Q&A
│   │   │   └── files.ts
│   │   ├── types/                    # Shared TypeScript types
│   │   └── hooks/                    # Shared React hooks (useMenu, useNearby, useChat)
│   └── ui/                           # Optional shared primitive components
└── turbo.json
```

---

## Convex Schema

Create `packages/shared/convex/schema.ts` with this exact schema:

```typescript
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
    claimedByOwner: v.boolean(),
    ownerId: v.optional(v.string()),
    createdAt: v.float64(),
  })
    .index("by_slug", ["slug"])
    .index("by_zip", ["zipCode"])
    .index("by_owner", ["ownerId"])
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

  menuCategories: defineTable({
    menuId: v.id("menus"),
    name: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.float64(),
  })
    .index("by_menu", ["menuId"]),

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
    createdAt: v.float64(),
  })
    .index("by_menu", ["menuId"])
    .index("by_user", ["userId"]),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.float64(),
  })
    .index("by_session", ["sessionId"]),
});
```

---

## AI — Menu Parsing Pipeline

Implement this as a Convex action in `packages/shared/convex/ai.ts`.

### Flow

1. Accept a `storageId` and `menuId` as arguments.
2. Retrieve the file from Convex storage using `ctx.storage.getUrl(storageId)`.
3. If the file is a PDF, convert each page to a base64-encoded PNG image server-side. Use `pdf-lib` or `pdf2pic` for this. Do not use any client-side PDF rendering.
4. For each page image, call the OpenAI GPT-4o Vision API with Structured Outputs enabled.

### OpenAI call

Use the following system prompt:

```
You are a menu extraction assistant. Extract every item from this restaurant menu image and organize it by category exactly as it appears. For each item include:
- name (exactly as written)
- description (if present)
- price (as a string, e.g. "$12.99" or "Market Price"; null if absent)
- allergens: infer from ingredient descriptions. Use only these values: ["gluten", "dairy", "nuts", "shellfish", "eggs", "soy", "fish"]
- dietaryTags: infer from descriptions. Use only these values: ["vegetarian", "vegan", "gf", "halal", "kosher"]
- spiceLevel: if mentioned, one of ["mild", "medium", "hot", "extra-hot"]; otherwise null

Return ONLY valid JSON matching the schema. Do not include any commentary.
```

Use this response schema for Structured Outputs:

```typescript
interface ParsedMenuSchema {
  categories: {
    name: string;
    description?: string;
    items: {
      name: string;
      description?: string;
      price?: string;
      allergens?: string[];
      dietaryTags?: string[];
      spiceLevel?: string;
    }[];
  }[];
}
```

5. Write the parsed categories and items to `menuCategories` and `menuItems` using internal mutations.
6. Update the menu `status` to `"ready"` and set `processedAt`.

---

## AI — Menu Q&A Chat

Implement as a Convex action in `packages/shared/convex/ai.ts`.

### Flow

1. Accept `sessionId`, `userMessage`, and `menuId`.
2. Query all `menuCategories` and `menuItems` for the menu. Serialize them into a plain-text menu context string (category name → items with descriptions and prices).
3. Fetch the last 10 messages from `chatMessages` for this session to use as conversation history.
4. Call GPT-4o Chat Completions with:
   - System message: `"You are a helpful assistant for a restaurant menu. Answer questions about the menu items, ingredients, allergens, dietary options, and prices based only on the menu provided. Be concise and friendly."`
   - User context message: the serialized menu text
   - Conversation history messages
   - The new user message
5. Stream the response. Write the assistant's reply to `chatMessages` when complete.
6. Use Convex's persistent reactivity pattern so the client receives the response in real time via a subscription.

---

## Next.js API Routes

### `POST /api/menus/parse`

- Accepts: `{ storageId: string, menuId: string, restaurantId: string }`
- Validates the user is authenticated with Clerk
- Triggers the Convex `parseMenu` action
- Returns: `{ success: true, menuId }`

### `POST /api/menus/[id]/chat`

- Accepts: `{ message: string, sessionId: string }`
- Validates the user is authenticated or anonymous session is valid
- Triggers the Convex `sendChatMessage` action
- Returns a streaming response using `ReadableStream`

### `GET /api/restaurants/nearby`

- Accepts: `?zip=75701` or `?lat=32.3&lng=-95.3`
- Geocodes ZIP to coordinates using Google Geocoding API if needed
- Queries Convex for restaurants with `published` menus near those coordinates (ZIP match for MVP)
- Returns: array of `{ id, name, slug, cuisineType, address, menuCount }`

---

## Public Menu Pages (Next.js SSG)

Create `apps/web/app/(consumer)/menu/[slug]/page.tsx`.

- Statically generate one page per published menu using `generateStaticParams`.
- Render the menu as fully semantic HTML:
  - `<h1>` for restaurant name
  - `<h2>` for menu title
  - `<h3>` for each category name
  - `<ul>` / `<li>` for items — never use tables for layout
  - Item description in a `<p>` tag
  - Price in a `<span>` with `aria-label="Price: $12.99"`
  - Allergen and dietary tags as a `<ul role="list">` with `aria-label="Dietary information"`
- Include a skip link: `<a href="#menu-content" class="sr-only focus:not-sr-only">Skip to menu</a>`
- Include JSON-LD structured data for Schema.org `Restaurant` and `Menu`
- Add a "Chat with this menu" button that links to `/chat/[menuId]`
- Add a "Report outdated menu" link
- No login required to view

---

## Expo Mobile App

Build the consumer mobile experience only. The restaurant portal is web-only in MVP.

### Tabs

- **Nearby** (`app/(tabs)/index.tsx`): ZIP code input + location permission button. Shows a list of nearby restaurants with published menus. Each row: restaurant name, cuisine type, distance.
- **Scan** (`app/(tabs)/scan.tsx`): Camera view to photograph a physical menu. On capture, uploads the image to Convex and triggers parsing. Shows a loading state while processing.
- **Saved** (`app/(tabs)/saved.tsx`): Previously viewed menus cached locally.

### Menu Detail (`app/menu/[id].tsx`)

- Fetches menu data from Convex via the shared `useMenu` hook.
- Renders categories as sections with `accessibilityRole="header"` on category names.
- Each item has a full `accessibilityLabel` that combines name, price, and key dietary tags.
- Use `accessibilityLiveRegion="polite"` on the loading state.

### Menu Chat (`app/chat/[id].tsx`)

- Full-screen chat interface.
- Uses the `useChatSession` hook from `packages/shared/hooks/`.
- Input field stays focused after sending a message.
- New assistant messages are announced via `accessibilityLiveRegion="polite"`.
- Haptic feedback on send and on receiving a response.

---

## Accessibility Requirements (Non-Negotiable)

Every component on both platforms must meet these standards. Test with VoiceOver (iOS/macOS) before marking any feature complete.

### Web (Next.js)

- Semantic HTML throughout. `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>` — no `<div>` where a semantic element exists.
- One `<h1>` per page. Heading hierarchy never skips levels.
- Every `<img>` has `alt` text. Decorative images use `alt=""`.
- Every interactive element reachable by keyboard (Tab, Enter, Space, Escape).
- Visible `:focus-visible` ring on all interactive elements.
- Skip links as the first focusable elements.
- `aria-live="polite"` on: upload progress, AI processing state, chat response streaming, search results updating.
- After upload completes, move focus to the parsed menu result.
- After chat submit, keep focus in the input field.
- WCAG AA contrast: 4.5:1 for body text, 3:1 for large text. Test both light and dark modes.
- `prefers-reduced-motion` respected — no animations when set.
- Color is never the sole means of conveying information.

### Mobile (Expo)

- `accessibilityLabel` on every interactive element — never rely on visible text alone.
- `accessibilityRole` set appropriately: `"button"`, `"header"`, `"image"`, `"link"`, `"text"`, `"search"`.
- `accessibilityHint` for non-obvious interactions.
- `accessibilityLiveRegion="polite"` for dynamic content updates.
- Touch targets minimum 44×44pt.
- `accessibilityState={{ busy: true }}` while AI is processing.
- Haptic feedback on: upload complete, parse complete, chat message sent, error.

---

## Authentication (Clerk)

- Set up Clerk with two roles using `publicMetadata`: `consumer` (default on signup) and `restaurant_owner`.
- Consumer features (browse, upload for personal use, chat) are available to any authenticated user.
- Restaurant portal routes (`/restaurant/*`) require `restaurant_owner` role — redirect to upgrade page if not.
- Public menu pages (`/menu/[slug]`) and nearby search are accessible without login.
- In the Expo app, use Clerk's Expo SDK. Pass the Clerk session token as a Bearer token in `Authorization` headers when calling Next.js API routes.

---

## Environment Variables

Create `.env.local` for `apps/web/` and `.env` for `apps/mobile/` with these keys:

```
# Convex
CONVEX_DEPLOYMENT=
NEXT_PUBLIC_CONVEX_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Google
GOOGLE_GEOCODING_API_KEY=
GOOGLE_PLACES_API_KEY=
```

---

## Build Order

Build features in this order. Do not move to the next phase until the current one is working and VoiceOver-tested.

### Phase 1: Scaffold

1. Clone Convex monorepo template
2. Define the Convex schema
3. Set up Clerk with roles
4. Verify `turbo dev` runs both apps
5. Set up basic navigation in both apps (no content yet)

### Phase 2: Menu Upload & Parsing

1. Implement Convex file storage upload flow
2. Implement PDF → image conversion
3. Implement GPT-4o Vision structured output parsing
4. Store parsed data in Convex
5. Build the accessible menu viewer component (web)
6. Build the upload UI (web and mobile)
7. VoiceOver test the upload → parse → view flow

### Phase 3: Menu Q&A Chat

1. Implement chat session management in Convex
2. Implement Q&A action with streaming
3. Build chat UI (web and mobile)
4. VoiceOver test: live regions, focus management, response announcements

### Phase 4: Nearby Discovery

1. Google Geocoding API integration
2. Nearby restaurant query (ZIP-based)
3. Build search/browse UI (web and mobile)
4. Add restaurant creation flow

### Phase 5: Restaurant Portal (Web Only)

1. Restaurant owner dashboard
2. Menu editing UI (correct AI output, add allergens)
3. Publish flow
4. Public menu SSG pages with JSON-LD

### Phase 6: Polish

1. Offline menu caching (mobile)
2. Error, empty, and loading states everywhere
3. Rate limiting on AI endpoints
4. Deploy: Vercel (web), EAS (mobile), Convex cloud

---

## Naming

The app is called **Menu Garden**. The package name is `menu-garden`. The public domain target is `menugarden.app`. Restaurant public menu URLs are structured as `/menu/[restaurant-slug]`.

