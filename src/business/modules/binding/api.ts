export interface BindingUserInfo {
  adapter: string;
  uid: number | null;
  qqAccounts: readonly string[];
}

import type { BusinessEvent } from "cocofaith-sdk/protocol";
export interface BindingApi {
  userInfo(event: Readonly<BusinessEvent>): Promise<BindingUserInfo>;
}
