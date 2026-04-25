export type RestaurantSummary = {
  id: string;
  name: string;
  slug: string;
  cuisineType?: string;
  address?: string;
  formattedAddress?: string;
  googlePlaceId?: string;
};

export type MenuCategorySummary = {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
};

export type MenuItemSummary = {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price?: string;
  allergens?: string[];
  dietaryTags?: string[];
  spiceLevel?: string;
  isAvailable: boolean;
  sortOrder: number;
};

export type MenuParseJobSummary = {
  id: string;
  status: "queued" | "converting" | "extracting" | "saving" | "ready" | "failed";
  message: string;
  errorMessage?: string;
  warnings?: string[];
  totalPages?: number;
  currentPage?: number;
  completedPages?: number;
  updatedAt: number;
};

export type MenuSummary = {
  id: string;
  title: string;
  status: "processing" | "ready" | "published" | "archived";
  visibility: "private" | "public" | "unlisted";
  restaurant: RestaurantSummary;
  categories: MenuCategorySummary[];
  items: MenuItemSummary[];
  parseJob: MenuParseJobSummary | null;
};

export type PublicMenuSummary = {
  id: string;
  title: string;
  restaurantName: string;
  restaurantSlug: string;
  categoryCount: number;
  itemCount: number;
  createdAt: number;
  processedAt?: number;
};

export type ChatMessageSummary = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "streaming" | "complete" | "failed";
  errorMessage?: string;
  referencedItemIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type AnonymousChatJobStatus =
  | "queued"
  | "loading_menu"
  | "analyzing_nutrition"
  | "drafting_answer"
  | "finding_items"
  | "complete"
  | "failed";

export type AnonymousChatJobSummary = {
  id: string;
  status: AnonymousChatJobStatus;
  message: string;
  step: number;
  totalSteps: number;
  answer?: string;
  referencedItemIds: string[];
  errorMessage?: string;
  updatedAt: number;
};

export type NearbyRestaurantActionTarget =
  | {
      type: "menu";
      menuId: string;
    }
  | {
      type: "upload";
      restaurantName: string;
      googlePlaceId?: string;
      formattedAddress?: string;
      latitude?: number;
      longitude?: number;
      zipCode?: string;
      cuisineType?: string;
    };

export type NearbyRestaurantSummary = {
  id?: string;
  googlePlaceId?: string;
  name: string;
  address?: string;
  formattedAddress?: string;
  zipCode?: string;
  cuisineType?: string;
  latitude?: number;
  longitude?: number;
  source: "google" | "local" | "merged";
  menuAvailability: "public" | "private" | "none";
  menuId?: string;
  menuTitle?: string;
  actionTarget: NearbyRestaurantActionTarget;
};

export type NearbySearchSummary = {
  status: "ready" | "setup_required";
  zipCode: string;
  message: string;
  results: NearbyRestaurantSummary[];
};
