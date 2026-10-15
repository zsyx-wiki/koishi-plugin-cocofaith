export type { JunkConfig } from "./config";
export type JunkState = ReturnType<typeof import("./module").junkState.parse>;
