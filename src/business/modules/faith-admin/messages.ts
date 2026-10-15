const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;
export const ADMIN_MESSAGES = Object.freeze({
    changed: (uid: number, field: string, delta: number) => `已为 UID ${uid} 调整 ${field}：${signed(delta)}`,
    changedAll: (field: string, delta: number, succeeded: number, skipped: number, failed: number) => `全体数值：${field} ${signed(delta)}\n范围：正常状态的已注册用户\n成功：${succeeded} 人\n已处理跳过：${skipped} 人\n失败：${failed} 人${failed ? "（详见日志）" : ""}`,
    commands: (commands: readonly string[]) => `可用管理命令：${commands.join("、")}`,
});
