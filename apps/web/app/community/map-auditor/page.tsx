import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MapAuditorCompatibilityRoute() {
  redirect("/community/historical-map-studio");
}
