import { MenuUploadForm } from "@/components/menu-upload-form";

type UploadPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getNumberSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = getSearchParam(searchParams, key);
  const numberValue = value ? Number(value) : Number.NaN;

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

export default async function UploadPage({ searchParams }: UploadPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};

  return (
    <MenuUploadForm
      initialCuisineType={getSearchParam(resolvedSearchParams, "cuisineType")}
      initialFormattedAddress={getSearchParam(resolvedSearchParams, "formattedAddress")}
      initialGooglePlaceId={getSearchParam(resolvedSearchParams, "googlePlaceId")}
      initialLatitude={getNumberSearchParam(resolvedSearchParams, "latitude")}
      initialLongitude={getNumberSearchParam(resolvedSearchParams, "longitude")}
      initialRestaurantName={getSearchParam(resolvedSearchParams, "restaurantName")}
      initialZipCode={getSearchParam(resolvedSearchParams, "zipCode")}
    />
  );
}
