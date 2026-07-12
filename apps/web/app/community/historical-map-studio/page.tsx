import { HistoricalMapStudio } from "@/components/HistoricalMapStudio";
import { MapStudioLogin } from "@/components/MapStudioLogin";
import { loadHistoricalMapStudioData } from "@/lib/historical-map-studio-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Historical Map Studio | The Mind's Eye",
};

type HistoricalMapStudioPageProps = {
  searchParams?: Promise<{
    town?: string;
    year?: string;
  }>;
};

export default async function HistoricalMapStudioPage({ searchParams }: HistoricalMapStudioPageProps) {
  const params = (await searchParams) ?? {};
  const studioState = await loadHistoricalMapStudioData({
    isOwner: true,
    townPackageId: params.town,
    mapYear: params.year,
  });

  if (studioState.mode === "setup_required") {
    return <MapStudioLogin studioState={studioState} />;
  }

  return <HistoricalMapStudio initialData={studioState} />;
}
