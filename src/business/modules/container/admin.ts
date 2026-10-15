import { useGameplayInterface } from "cocofaith-sdk/gameplay";
import { BusinessError } from "../../framework/errors";
import type { BusinessModuleContext } from "../../framework/types";
import { ADMIN_COMMANDS_API, ADMIN_FIELDS_API } from "../../shared/contracts";
import type { ContainerConfig } from "./config";
import { containerText } from "./messages";
import type { ContainerService } from "./service";
export function registerContainerAdmin(context: BusinessModuleContext<ContainerConfig>, service: ContainerService) {
    const fields = useGameplayInterface(context, ADMIN_FIELDS_API);
    context.core.lifecycle.track(fields.register({
        name: "神性", description: "调整神性容器中的神性。", async change({ targetUid, delta, operationId }) {
            const value = await service.adjustDivinity(targetUid, delta, operationId);
            return `UID ${targetUid} 当前神性：${value.toFixed(2)}`;
        }
    }));
    context.core.lifecycle.track(fields.register({
        name: "觐献次数", description: "调整神性容器觐献次数。", async change({ targetUid, delta, operationId }) {
            const value = await service.adjustCharges(targetUid, delta, operationId);
            return `UID ${targetUid} 当前觐献次数：${value}`;
        }
    }));
    const admin = useGameplayInterface(context, ADMIN_COMMANDS_API);
    context.core.lifecycle.track(admin.register({
        business: "container", command: "容器", description: "查看或发放神性容器", async execute({ args, requestId }) {
            const action = args[0], uid = Number(args[1]);
            if (!Number.isSafeInteger(uid))
                throw usageError();
            if (action === "查看") {
                const value = await service.status(uid);
                return { type: "text", content: containerText.status(value, context.config.maxCapacity, context.config.passiveMaxDivinity, context.config.goldPerDivinity, context.config.ascensionPerDivinity, context.config.maxConsecrationCharges) };
            }
            if (action === "发放") {
                const result = await service.grant(uid, "admin", requestId);
                return { type: "text", content: result.kind === "container" ? `已向 UID ${uid} 发放【神性容器】。` : `UID ${uid} 已有容器，改为发放【神性碎片】。` };
            }
            if (action === "撤销从神") {
                const changed = await service.revokeSubgod(uid, requestId);
                return { type: "text", content: changed ? `已撤销 UID ${uid} 的从神身份。` : `UID ${uid} 当前不是从神。` };
            }
            throw usageError();
        }
    }));
}
function usageError() {
    return new BusinessError("INVALID_INPUT", "格式：信仰管理 容器 [查看|发放|撤销从神] [uid]");
}
