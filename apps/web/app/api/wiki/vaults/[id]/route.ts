import { NextRequest } from "next/server";
import { success, error, validateBody, handleApiError } from "@/lib/utils";
import { updateWikiVaultSchema } from "@/lib/schemas";
import { getVault, updateVault, deleteVault } from "@/lib/services/wiki-service";
import { withActor, resolveActor } from "@/lib/context";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vault = await getVault(id);
  if (!vault) return error("Vault 不存在", 404);
  return success(vault);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const validated = await validateBody(request, updateWikiVaultSchema);
  if (!validated.ok) return validated.response;

  try {
    const vault = await withActor(resolveActor(request.headers), () =>
      updateVault(id, validated.data),
    );
    return success(vault);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await withActor(resolveActor(request.headers), () => deleteVault(id));
    return success({ message: "Vault 已删除" });
  } catch (err) {
    return handleApiError(err);
  }
}
