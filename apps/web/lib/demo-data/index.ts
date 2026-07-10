import rawCommunityDemo from "./community.json" with { type: "json" };

export type CommunityDemoData = typeof rawCommunityDemo;

export const communityDemo = rawCommunityDemo as CommunityDemoData;
