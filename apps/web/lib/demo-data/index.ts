import rawCommunityDemo from "./community.json";

export type CommunityDemoData = typeof rawCommunityDemo;

export const communityDemo = rawCommunityDemo as CommunityDemoData;
