// =============================================================================
// HabitOT — Email Reminder Edge Function
// =============================================================================
//
// This Supabase Edge Function sends email reminders:
//   1. DAILY DIGEST (pg_cron) — runs once at 7 AM Manila, finds every task due
//      today and hands Resend one scheduled send per task, timed for an hour
//      before that task is due. Resend holds the queue and delivers on time.
//   2. SYNC TASK REMINDER — called by the frontend whenever a task is created,
//      edited, completed or deleted. Cancels that task's queued email and, if
//      it still needs one today, queues it again for the right time.
//      The caller must be the task's therapist or patient (checked from their
//      login token); everything else is read from the task itself.
//
// It used to poll every 15 minutes. That cost ~96 pg_net round trips a day and
// was responsible for ~70% of all database execution time and 99.8% of write
// IO, which exhausted the project's disk IO budget. One run a day does the
// same job because Resend handles the waiting.
//
// ── How to activate ──────────────────────────────────────────────────────
//   1. Sign up at https://resend.com and get an API key
//   2. Set the secret:  supabase secrets set RESEND_API_KEY=re_xxxxx
//   3. Deploy:  supabase functions deploy send-email-reminders
//   4. Run supabase/migration-2026-10-disk-io.sql to set up pg_cron
// ─────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = "HabitOT <notifications@itsbydan.com>";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Tasks store assigned_date/assigned_time as Manila wall-clock (UTC+8)
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
// How far ahead of a task its reminder goes out
const LEAD_MS = 60 * 60 * 1000;

// ── Email sender via Resend ─────────────────────────────────────────────
// `sendAt` (ISO 8601) asks Resend to hold the email until then. Resend accepts
// a schedule up to 30 days out; omitting it sends immediately.
// Resend's reason for the most recent failed send, reported back to callers
let lastSendError = "";

// Returns Resend's email id (needed to cancel a scheduled send), or null.
async function sendEmail(to: string, subject: string, html: string, sendAt?: string): Promise<string | null> {
  const post = () => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      ...(sendAt ? { scheduled_at: sendAt } : {}),
    }),
  });
  let res = await post();
  // Rate limited (the digest sends back to back): wait and try once more
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await post();
  }

  if (!res.ok) {
    lastSendError = await res.text();
    console.error("Resend error:", lastSendError);
    return null;
  }
  const data = await res.json().catch(() => ({}));
  return data.id || "sent";
}

// Placeholder provider_id while a digest send is in flight (see claimEmail)
const PENDING = "pending";

async function cancelEmail(id: string) {
  const res = await fetch(`https://api.resend.com/emails/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  // Already delivered (or never scheduled) can't be cancelled; that's fine
  if (!res.ok) console.log(`Resend cancel ${id}: ${res.status} ${await res.text()}`);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// When a task's reminder should go out: an hour before it's due, never in the
// past, and never before the task is posted to the patient.
function reminderSendAt(dueAt: Date, publishAt: string | null, now: Date) {
  let at = Math.max(dueAt.getTime() - LEAD_MS, now.getTime());
  if (publishAt) at = Math.max(at, new Date(publishAt).getTime());
  return new Date(at);
}

// The UTC instant a task is due, from its Manila-local date and time
function taskInstantUtc(date: string, time: string) {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(new Date(`${date}T${t}Z`).getTime() - MANILA_OFFSET_MS);
}

// ── Prevent duplicate emails ────────────────────────────────────────────
async function logEmail(recipientId: string, type: string, refDate: string, providerId: string | null) {
  const { error } = await supabase.from("email_log").upsert(
    { recipient_id: recipientId, email_type: type, reference_date: refDate, provider_id: providerId },
    { onConflict: "recipient_id,email_type,reference_date" },
  );
  if (error) console.error("email_log write failed:", error.message);
}

// Reserves this email before sending it. The unique index on email_log means
// only one of two overlapping runs gets the row, so a reminder can't be
// queued twice. Returns false if it's already claimed or logged.
async function claimEmail(recipientId: string, type: string, refDate: string) {
  const { error } = await supabase.from("email_log").insert(
    { recipient_id: recipientId, email_type: type, reference_date: refDate, provider_id: PENDING },
  );
  if (!error) return true;
  if (error.code !== "23505") console.error("email_log claim failed:", error.message);
  return false;
}

// ── Build reminder email HTML ───────────────────────────────────────────
function buildReminderHtml(firstName: string, taskTitle: string, formattedDate: string, formattedTime: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #2c3436;">Hi ${escapeHtml(firstName)}!</h2>
      <p>Friendly reminder — you have a task coming up soon:</p>
      <div style="background: #f8f9fa; border-left: 4px solid #863bff; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-weight: bold; color: #2c3436;">${escapeHtml(taskTitle)}</p>
        <p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">${formattedDate} at ${formattedTime}</p>
      </div>
      <p>Log in to <a href="https://habitot.vercel.app/patient" style="color: #863bff;">HabitOT</a> to complete it.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #9ca3af;">
        You received this because email reminders are enabled on your HabitOT account.
      </p>
    </div>
  `;
}

function formatTime(date: string, time: string) {
  // time from DB is "HH:MM:SS", from frontend is "HH:MM"
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ── 1. Daily digest: queue every reminder for today (called by pg_cron) ──
async function scheduleTodaysReminders() {
  const now = new Date();
  const today = new Date(now.getTime() + MANILA_OFFSET_MS)
    .toISOString()
    .split("T")[0];

  const { data: tasks, error: tasksErr } = await supabase
    .from("task_assignments")
    .select("id, title, assigned_date, assigned_time, patient_id, publish_at")
    .eq("assigned_date", today)
    .neq("status", "completed")
    .not("is_rest_day", "is", true)
    .not("assigned_time", "is", null);

  if (tasksErr) throw new Error(`Failed to load today's tasks: ${tasksErr.message}`);
  if (!tasks || tasks.length === 0) return;

  // Group by patient
  const byPatient: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    if (!byPatient[task.patient_id]) byPatient[task.patient_id] = [];
    byPatient[task.patient_id].push(task);
  }

  const patientIds = Object.keys(byPatient);
  const { data: patients } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("email_notifications_enabled", true)
    .in("id", patientIds);

  if (!patients || patients.length === 0) return;

  for (const patient of patients) {
    for (const task of byPatient[patient.id] || []) {
      const dueAt = taskInstantUtc(task.assigned_date, task.assigned_time);
      // Already overdue by the time the digest runs — the in-app overdue
      // notification covers this, so an email would only arrive late.
      if (dueAt <= now) continue;

      // Not before the task is posted; skip it if it posts after it's due
      const sendAt = reminderSendAt(dueAt, task.publish_at, now);
      if (sendAt >= dueAt) continue;

      const emailType = `patient_task_reminder_${task.id}`;
      if (!(await claimEmail(patient.id, emailType, today))) continue;

      const fTime = formatTime(task.assigned_date, task.assigned_time);
      const fDate = formatDate(task.assigned_date);
      const firstName = patient.full_name?.split(" ")[0] || "there";

      const subject = `HabitOT — Reminder: "${task.title}" is due at ${fTime}`;
      const html = buildReminderHtml(firstName, task.title, fDate, fTime);

      // Claimed before sending, so a re-run today won't double-queue it
      const id = await sendEmail(patient.email, subject, html, sendAt.toISOString());
      const match = { recipient_id: patient.id, email_type: emailType, reference_date: today };
      if (id) {
        const { data: kept } = await supabase.from("email_log")
          .update({ provider_id: id }).match(match).eq("provider_id", PENDING).select("id");
        // A task sync replaced or removed the claim while this was sending (the
        // task changed, or it queued its own reminder): this email is stale
        if (!kept?.length && id !== "sent") await cancelEmail(id);
      }
      // Not sent: release the claim so the next run can try again
      else await supabase.from("email_log").delete().match(match).eq("provider_id", PENDING);
    }
  }
}

// ── 2. Keep one task's reminder in step with the task ────────────────────
// Cancels whatever is queued for the task, then queues a fresh reminder if
// the task still needs one today. Called after create, edit, complete and
// delete, so a moved or finished task never gets a stale "due at" email.
async function syncTaskReminder(taskId: string, callerId: string) {
  const emailType = `patient_task_reminder_${taskId}`;
  const { data: task } = await supabase
    .from("task_assignments")
    .select("id, title, assigned_date, assigned_time, patient_id, therapist_id, status, is_rest_day, publish_at")
    .eq("id", taskId)
    .maybeSingle();

  // A deleted task can only lose its reminder, so anyone may trigger that
  if (task && callerId !== task.therapist_id && callerId !== task.patient_id) {
    return { status: 403, error: "Not your task" };
  }

  const { data: logs } = await supabase
    .from("email_log")
    .select("*")
    .eq("email_type", emailType);
  const queued = logs || [];
  // Rows from before provider ids were stored can't be cancelled: leave them
  // alone rather than risk sending the reminder twice.
  if (queued.some((l) => !l.provider_id)) return { status: 200, result: "legacy reminder left as is" };

  const now = new Date();
  const today = new Date(now.getTime() + MANILA_OFFSET_MS).toISOString().split("T")[0];
  const dueAt = task?.assigned_time ? taskInstantUtc(task.assigned_date, task.assigned_time) : null;
  const sendAt = task && dueAt ? reminderSendAt(dueAt, task.publish_at, now) : null;
  const wanted = !!task && !!dueAt && !!sendAt
    && task.status !== "completed" && !task.is_rest_day
    && task.assigned_date === today && sendAt < dueAt;

  // Cancel what the delete actually removed, not the earlier read: a digest
  // send can store its email id in between, and that email must go too
  if (queued.length) {
    const { data: removed } = await supabase.from("email_log")
      .delete().eq("email_type", emailType).select("provider_id");
    for (const log of removed || []) {
      if (log.provider_id && log.provider_id !== "sent" && log.provider_id !== PENDING) {
        await cancelEmail(log.provider_id);
      }
    }
  }
  if (!wanted) return { status: 200, result: queued.length ? "cancelled" : "nothing to do" };

  const { data: patient } = await supabase
    .from("profiles")
    .select("id, email, full_name, email_notifications_enabled")
    .eq("id", task!.patient_id)
    .single();
  if (!patient || !patient.email_notifications_enabled) return { status: 200, result: "emails off" };

  const fTime = formatTime(task!.assigned_date, task!.assigned_time);
  const fDate = formatDate(task!.assigned_date);
  const firstName = patient.full_name?.split(" ")[0] || "there";
  const subject = `HabitOT — Reminder: "${task!.title}" is due at ${fTime}`;
  const html = buildReminderHtml(firstName, task!.title, fDate, fTime);

  const id = await sendEmail(patient.email, subject, html, sendAt!.toISOString());
  if (id) await logEmail(patient.id, emailType, task!.assigned_date, id);
  return { status: 200, result: id ? "scheduled" : `send failed: ${lastSendError.slice(0, 200)}` };
}

// ── COMMENTED OUT — previous immediate "task created" email ─────────────
// async function sendTaskCreatedEmail(patientId, taskTitle, assignedDate, assignedTime) { ... }

// ── CORS headers ────────────────────────────────────────────────────────
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

// ── HTTP Handler ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { type } = body;

    // pg_cron calls this once a day at 7 AM Manila. Only the cron job knows the
    // secret (kept in Vault); the anon key alone is public.
    if (type === "patient" || type === "all") {
      const { data: secret, error } = await supabase.rpc("get_email_cron_secret");
      if (error || !secret || req.headers.get("x-cron-secret") !== secret) {
        return json({ error: "Not allowed" }, 401);
      }
      await scheduleTodaysReminders();
    }

    // Frontend calls this after creating, editing, completing or deleting a
    // task. "task_reminder_immediate" is the name older app builds still send.
    if (type === "sync_task_reminder" || type === "task_reminder_immediate") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: auth } = await supabase.auth.getUser(token);
      if (!auth?.user) return json({ error: "Not signed in" }, 401);
      if (typeof body.task_id !== "string") return json({ error: "task_id required" }, 400);
      const out = await syncTaskReminder(body.task_id, auth.user.id);
      return json(out, out.status);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Email reminder error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
