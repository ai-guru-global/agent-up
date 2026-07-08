import { NextRequest } from "next/server";
import { success, error, parseBody } from "@/lib/utils";
import { getVault, updateVault, deleteVault } from "@/lib/services/wiki-service";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vault = await getVault(id);
  if (!vault) return error("Vault 不存在", 404);
  return success(vault);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await parseBody(request);
  if (!body) return error("无效的请求体");
  try {
    const vault = await updateVault(id, body);
    return success(vault);
  } catch (err) {
    return error(err instanceof Error ? err.message : "更新失败", 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await deleteVault(id);
    return success({ message: "Vault 已删除" });
  } catch (err) {
    return error(err instanceof Error ? err.message : "删除失败", 500);
  }
}
