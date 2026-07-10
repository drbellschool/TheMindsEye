import type { ReactNode } from "react";

import { CommunityShell } from "@/components/CommunityShell";
import { loadCommunityData } from "@/lib/community-data";

export default async function CommunityLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { data: communityData } = await loadCommunityData();

  return <CommunityShell demo={communityData}>{children}</CommunityShell>;
}
