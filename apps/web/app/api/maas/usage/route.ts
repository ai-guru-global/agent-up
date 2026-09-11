import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { getMaasUsageReport } from "@/lib/services/maas-usage-service";

/**
 * GET /api/maas/usage — 每 Agent 真实模型用量（聚合试聊 trace，非 mock）。
 *
 * 诚实口径：数据仅覆盖试聊 Playground 产生的 trace，不代表生产调用分布；
 * 无任何 trace 时 hasData=false，页面回退 MOCK 演示口径并声明「尚无试聊数据」。
 */
export async function GET(_request: NextRequest) {
  try {
    return success(await getMaasUsageReport());
  } catch (err) {
    return handleApiError(err);
  }
}
