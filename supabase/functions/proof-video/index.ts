// =============================================================================
// HabitOT — Proof Video Edge Function (Cloudflare R2)
// =============================================================================
//
// Proof videos live in a private Cloudflare R2 bucket; photos stay in Supabase
// Storage. The browser never sees the R2 keys: it asks this function for a
// short-lived signed link, then talks to R2 directly.
//
//   upload  {task_id, size, content_type} → signed PUT link (10 min)
//           The link signs Content-Length, so R2 rejects any other body size.
//   confirm {task_id, key, duration}      → checks the object landed, saves
//           task_assignments.proof_video, removes the video it replaces
//   view    {task_id}                     → signed GET link (1 hour), or
//           {expired: true} once the R2 lifecycle rule has deleted it
//
// R2 deletes every object RETENTION_DAYS after upload (bucket lifecycle rule).
//
// ── Setup ────────────────────────────────────────────────────────────────
//   supabase secrets set R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… \
//     R2_SECRET_ACCESS_KEY=… R2_BUCKET=habitot-proof-videos
//   supabase functions deploy proof-video --project-ref afzprgdowymgvmxtrqzc
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
// Must match the bucket's lifecycle rule and RETENTION_DAYS in src/utils/proofs.js
const RETENTION_DAYS = Number(Deno.env.get("R2_RETENTION_DAYS") || 10);

const MAX_BYTES = 15 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };
const R2_HOST = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── AWS SigV4 query-string presigning (R2 speaks the S3 API) ──────────────
const enc = new TextEncoder();

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(s: string) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

async function hmac(key: ArrayBuffer | Uint8Array, s: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(s));
}

// RFC 3986 encoding, as SigV4 requires
function uriEncode(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Signed URL for one R2 object (or the bucket itself when `key` is empty).
 * Every header in `headers` is signed, so the request must send exactly those
 * values (e.g. Content-Length caps the size). `params` are extra query
 * parameters, such as a ListObjectsV2 prefix.
 */
async function presign(
  method: string,
  key: string,
  expiresSec: number,
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const path = key ? `/${R2_BUCKET}/${key.split("/").map(uriEncode).join("/")}` : `/${R2_BUCKET}`;

  const allHeaders: Record<string, string> = { host: R2_HOST };
  for (const [k, v] of Object.entries(headers)) allHeaders[k.toLowerCase()] = String(v);
  const names = Object.keys(allHeaders).sort();
  const signedHeaders = names.join(";");

  const query: Record<string, string> = {
    ...params,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${R2_ACCESS_KEY_ID}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query).sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`).join("&");

  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    names.map((n) => `${n}:${allHeaders[n].trim()}\n`).join(""),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  let signingKey = await hmac(enc.encode("AWS4" + R2_SECRET_ACCESS_KEY), day);
  for (const part of ["auto", "s3", "aws4_request"]) signingKey = await hmac(signingKey, part);
  const signature = toHex(await hmac(signingKey, stringToSign));

  return `https://${R2_HOST}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ── Access checks ───────────────────────────────────────────────────────
type Task = {
  id: string;
  patient_id: string;
  therapist_id: string;
  requires_proof: boolean;
  is_rest_day: boolean | null;
  proof_video: { key: string; size: number; uploaded_at: string; duration?: number } | null;
};

async function loadTask(taskId: unknown): Promise<Task | null> {
  if (typeof taskId !== "string") return null;
  const { data } = await supabase
    .from("task_assignments")
    .select("id, patient_id, therapist_id, requires_proof, is_rest_day, proof_video")
    .eq("id", taskId)
    .maybeSingle();
  return data as Task | null;
}

// The patient, the task's therapist, or anyone linked to the patient
// (therapist or caregiver) through patient_assignments.
async function canView(userId: string, task: Task) {
  if (userId === task.patient_id || userId === task.therapist_id) return true;
  const { data } = await supabase
    .from("patient_assignments")
    .select("id")
    .eq("patient_id", task.patient_id)
    .eq("assigned_to", userId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// Size of an uploaded object, or null if R2 doesn't have it. Retries briefly:
// confirm runs right after the browser's PUT, and a miss there makes the
// patient upload the whole video again.
async function headSize(key: string): Promise<number | null> {
  let status = 0;
  for (const delay of [0, 500, 1000, 2000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const res = await fetch(await presign("HEAD", key, 60), { method: "HEAD" });
    status = res.status;
    if (res.ok) return Number(res.headers.get("content-length") || 0);
  }
  console.error(`proof-video: HEAD ${key} still ${status} after retries`);
  return null;
}

// Every object stored for a task: one per upload attempt
async function listTaskObjects(task: Task): Promise<string[]> {
  const prefix = `${task.patient_id}/${task.id}-`;
  const res = await fetch(await presign("GET", "", 60, {}, { "list-type": "2", prefix }));
  if (!res.ok) {
    console.error("proof-video: list failed", res.status, await res.text());
    return [];
  }
  const xml = await res.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
}

async function deleteObject(key: string) {
  await fetch(await presign("DELETE", key, 60), { method: "DELETE" }).catch(() => {});
}

function isExpired(video: Task["proof_video"]) {
  if (!video) return true;
  return Date.now() - new Date(video.uploaded_at).getTime() > RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

// ── Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await supabase.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: "Not signed in" }, 401);

    const body = await req.json();
    const task = await loadTask(body.task_id);
    if (!task) return json({ error: "Task not found" }, 404);

    if (body.action === "upload") {
      if (task.patient_id !== user.id) return json({ error: "Not your task" }, 403);
      if (!task.requires_proof || task.is_rest_day) return json({ error: "This task does not take proof" }, 400);

      const size = Number(body.size);
      const ext = CONTENT_TYPES[body.content_type];
      if (!ext) return json({ error: "Unsupported video format" }, 400);
      if (!Number.isInteger(size) || size <= 0) return json({ error: "Invalid size" }, 400);
      if (size > MAX_BYTES) return json({ error: "Video is larger than 15 MB" }, 413);

      const key = `${task.patient_id}/${task.id}-${Date.now()}.${ext}`;
      const url = await presign("PUT", key, 600, {
        "content-length": String(size),
        "content-type": body.content_type,
      });
      return json({ url, key });
    }

    if (body.action === "confirm") {
      if (task.patient_id !== user.id) return json({ error: "Not your task" }, 403);
      const key = String(body.key || "");
      if (!key.startsWith(`${task.patient_id}/${task.id}-`)) return json({ error: "Invalid key" }, 400);

      const size = await headSize(key);
      if (size === null) {
        return json({ error: "The video didn't finish uploading. Please tap Submit again." }, 409);
      }

      const duration = Math.round(Number(body.duration) || 0) || null;
      const proofVideo = { key, size, uploaded_at: new Date().toISOString(), duration };
      const { error } = await supabase
        .from("task_assignments")
        .update({ proof_video: proofVideo })
        .eq("id", task.id);
      if (error) return json({ error: error.message }, 500);

      // One video per task: remove the one it replaces and any leftovers from
      // failed attempts. They'd expire on their own; this frees the space sooner.
      const stale = (await listTaskObjects(task)).filter((k) => k !== key);
      await Promise.all(stale.map(deleteObject));
      return json({ proof_video: proofVideo, removed: stale.length });
    }

    if (body.action === "view") {
      if (!(await canView(user.id, task))) return json({ error: "Not allowed" }, 403);
      if (!task.proof_video) return json({ error: "No video on this task" }, 404);
      if (isExpired(task.proof_video)) return json({ expired: true, retention_days: RETENTION_DAYS });
      return json({ url: await presign("GET", task.proof_video.key, 3600) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("proof-video error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
