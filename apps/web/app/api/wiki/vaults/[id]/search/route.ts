import { NextRequest } from "next/server";
import { success, handleApiError } from "@/lib/utils";
import { wikiSearchQuerySchema } from "@/lib/schemas";
import { getVault } from "@/lib/services/wiki-service";
import { searchWiki } from "@/lib/services/retrieval-service";
import { NotFoundError, ValidationError } from "@/lib/errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const parsed = wikiSearchQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    threshold: searchParams.get("threshold") ?? undefined,
  });
  if (!parsed.success) {
    return handleApiError(new ValidationError("检索参数不合法", parsed.error.flatten()));
  }

  try {
    const vault = await getVault(id);
    if (!vault) throw new NotFoundError("Vault 不存在");

    const result = await searchWiki({
      query: parsed.data.q,
      vaultId: id,
      maxResults: parsed.data.limit,
      confidenceThreshold: parsed.data.threshold,
    });
    return success(result);
  } catch (err) {
    return handleApiError(err);
  }
}
