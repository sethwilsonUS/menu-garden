import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@menu-garden/shared/convex/_generated/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zipCode = searchParams.get("zip")?.trim();

  if (!zipCode) {
    return NextResponse.json(
      { message: "Enter a 5-digit U.S. ZIP code.", restaurants: [] },
      { status: 400 }
    );
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return NextResponse.json(
      {
        message: "Nearby search is not available right now.",
        restaurants: [],
      },
      { status: 500 }
    );
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const result = await client.action(api.restaurants.searchNearby, { zipCode });

    return NextResponse.json({
      ...result,
      restaurants: result.results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Nearby restaurant search is not available right now.",
        restaurants: [],
      },
      { status: 500 }
    );
  }
}
