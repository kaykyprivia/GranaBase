import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "avatars";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "jpg",
  "image/heif": "jpg",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function ensureBucket(admin: ReturnType<typeof adminClient>) {
  try {
    const { data: buckets } = await admin.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === BUCKET) ?? false;
    if (!exists) {
      await admin.storage.createBucket(BUCKET, { public: true });
    }
  } catch {
    // If we can't check/create, proceed — upload will surface the real error
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const mimeType = file.type.toLowerCase().split(";")[0].trim();

    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Selecione uma imagem valida." }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "A foto deve ter no maximo 15MB." }, { status: 400 });
    }

    const admin = adminClient();
    await ensureBucket(admin);

    // Derive extension from MIME type — never trust the filename
    const ext = MIME_TO_EXT[mimeType] ?? "jpg";
    const objectPath = `${user.id}/avatar.${ext}`;

    // Remove existing object first to avoid the "string did not match the expected pattern"
    // bug that Supabase Storage throws on upsert when the ETag differs
    await admin.storage.from(BUCKET).remove([objectPath]);

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, buffer, { contentType: `image/${ext}` });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Add a cache-busting query param so the browser fetches the new photo
    const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
    const urlWithBust = `${publicUrl}?t=${Date.now()}`;

    return NextResponse.json({ url: urlWithBust });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno no servidor.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
