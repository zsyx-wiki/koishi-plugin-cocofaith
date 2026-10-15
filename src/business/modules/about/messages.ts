export const ABOUT_MESSAGES = (koishi: string, version: string, adapter: string) => [
  "关于椰子水",
  `CoCoFaith：v${version}`,
  `Koishi：v${koishi}`,
  `消息适配：${adapter}`,
].join("\n");
