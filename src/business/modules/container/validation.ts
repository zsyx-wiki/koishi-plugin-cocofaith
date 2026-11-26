import { BusinessError } from "../../framework/errors";
export function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new BusinessError("INVALID_INPUT", `${label}必须是正整数。`);
}
