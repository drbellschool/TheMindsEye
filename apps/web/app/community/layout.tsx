import type { ReactNode } from "react";

import { CommunityShell } from "@/components/CommunityShell";
import { communityDemo } from "@/lib/demo-data";

export default function CommunityLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <CommunityShell demo={communityDemo}>{children}</CommunityShell>;
}
