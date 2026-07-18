import { HistoricalMapStudio } from "@/components/HistoricalMapStudio";
import { loadHistoricalMapStudioData } from "@/lib/historical-map-studio-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Historical Map Studio | The Mind's Eye",
};

type HistoricalMapStudioPageProps = {
  searchParams?: Promise<{
    atlas?: string;
    atlasId?: string;
    page?: string;
    atlasPageId?: string;
    piece?: string;
    mapPieceId?: string;
    indexRegionId?: string;
    sheet?: string;
    sheetAssetId?: string;
    town?: string;
    townPackageId?: string;
    workflow?: string;
    year?: string;
    mapYear?: string;
  }>;
};

export default async function HistoricalMapStudioPage({ searchParams }: HistoricalMapStudioPageProps) {
  const params = (await searchParams) ?? {};
  const studioState = await loadHistoricalMapStudioData({
    townPackageId: params.townPackageId ?? params.town,
    mapYear: params.mapYear ?? params.year,
  });

  return (
    <HistoricalMapStudio
      initialData={studioState}
      initialSelection={{
        workflowStep: params.workflow,
        atlasId: params.atlasId ?? params.atlas,
        pageId: params.atlasPageId ?? params.page,
        pieceId: params.mapPieceId ?? params.piece,
        assetId: params.sheetAssetId ?? params.sheet,
        indexRegionId: params.indexRegionId,
      }}
    />
  );
}
