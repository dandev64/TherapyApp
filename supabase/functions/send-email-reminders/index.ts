// =============================================================================
// HabitOT — Email Reminder Edge Function
// =============================================================================
//
// This Supabase Edge Function sends email reminders:
//   1. DAILY DIGEST (pg_cron) — runs once at 7 AM Manila, finds every task due
//      today and hands Resend one scheduled send per task, timed for an hour
//      before that task is due. Resend holds the queue and delivers on time.
//   2. TASK REMINDER IMMEDIATE — called by the frontend when a task is created
//      after the digest has already run; schedules (or sends) that one task.
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
async function sendEmail(to: string, subject: string, html: string, sendAt?: string) {
  const res = await fetch("https://api.resend.com/emails", {
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

  if (!res.ok) {
    console.error("Resend error:", await res.text());
  }
  return res.ok;
}

// The UTC instant a task is due, from its Manila-local date and time
function taskInstantUtc(date: string, time: string) {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(new Date(`${date}T${t}Z`).getTime() - MANILA_OFFSET_MS);
}

// ── Prevent duplicate emails ────────────────────────────────────────────
async function alreadySent(recipientId: string, type: string, refDate: string) {
  const { count } = await supabase
    .from("email_log")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .eq("email_type", type)
    .eq("reference_date", refDate);
  return (count || 0) > 0;
}

async function logEmail(recipientId: string, type: string, refDate: string) {
  await supabase.from("email_log").insert({
    recipient_id: recipientId,
    email_type: type,
    reference_date: refDate,
  });
}

// ── Build reminder email HTML ───────────────────────────────────────────
function buildReminderHtml(firstName: string, taskTitle: string, formattedDate: string, formattedTime: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #2c3436;">Hi ${firstName}!</h2>
      <p>Friendly reminder — you have a task coming up soon:</p>
      <div style="background: #f8f9fa; border-left: 4px solid #863bff; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-weight: bold; color: #2c3436;">${taskTitle}</p>
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

  const { data: tasks } = await supabase
    .from("task_assignments")
    .select("id, title, assigned_date, assigned_time, patient_id, publish_at")
    .eq("assigned_date", today)
    .neq("status", "completed")
    .not("assigned_time", "is", null);

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

      // Don't email about a task the patient still can't see at send time
      const sendAt = new Date(Math.max(dueAt.getTime() - LEAD_MS, now.getTime()));
      if (task.publish_at && new Date(task.publish_at) > sendAt) continue;

      const emailType = `patient_task_reminder_${task.id}`;
      if (await alreadySent(patient.id, emailType, today)) continue;

      const fTime = formatTime(task.assigned_date, task.assigned_time);
      const fDate = formatDate(task.assigned_date);
      const firstName = patient.full_name?.split(" ")[0] || "there";

      const subject = `HabitOT — Reminder: "${task.title}" is due at ${fTime}`;
      const html = buildReminderHtml(firstName, task.title, fDate, fTime);

      // Logged at schedule time, so a re-run today won't double-queue it
      const sent = await sendEmail(patient.email, subject, html, sendAt.toISOString());
      if (sent) await logEmail(patient.id, emailType, today);
    }
  }
}

// ── 2. One-off reminder: task created after today's digest already ran ──
// Schedules for an hour before the task, or sends now if that moment passed.
async function sendTaskReminderImmediate(patientId: string, taskId: string, taskTitle: string, assignedDate: string, assignedTime: string) {
  const emailType = `patient_task_reminder_${taskId}`;
  if (await alreadySent(patientId, emailType, assignedDate)) return;

  const now = new Date();
  const dueAt = taskInstantUtc(assignedDate, assignedTime);
  if (dueAt <= now) return;
  const sendAt = new Date(Math.max(dueAt.getTime() - LEAD_MS, now.getTime()));

  const { data: patient } = await supabase
    .from("profiles")
    .select("id, email, full_name, email_notifications_enabled")
    .eq("id", patientId)
    .single();

  if (!patient || !patient.email_notifications_enabled) return;

  const fTime = formatTime(assignedDate, assignedTime);
  const fDate = formatDate(assignedDate);
  const firstName = patient.full_name?.split(" ")[0] || "there";

  const subject = `HabitOT — Reminder: "${taskTitle}" is due at ${fTime}`;
  const html = buildReminderHtml(firstName, taskTitle, fDate, fTime);

  const sent = await sendEmail(patient.email, subject, html, sendAt.toISOString());
  if (sent) await logEmail(patientId, emailType, assignedDate);
}

// ── COMMENTED OUT — previous immediate "task created" email ─────────────
// async function sendTaskCreatedEmail(patientId, taskTitle, assignedDate, assignedTime) { ... }

// ── CORS headers ────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── HTTP Handler ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({ type: "all" }));
    const { type } = body;

    // pg_cron calls this once a day at 7 AM Manila
    if (type === "patient" || type === "all") {
      await scheduleTodaysReminders();
    }

    // Frontend calls this when a task is created after the digest has run
    if (type === "task_reminder_immediate") {
      const { patient_id, task_id, title, assigned_date, assigned_time } = body;
      await sendTaskReminderImmediate(patient_id, task_id, title, assigned_date, assigned_time);
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
