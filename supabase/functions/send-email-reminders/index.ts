// =============================================================================
// HabitOT — Email Reminder Edge Function
// =============================================================================
//
// This Supabase Edge Function sends email reminders:
//   1. PATIENT REMINDER (pg_cron) — runs every 15 min, checks for tasks due
//      in the next 15 min that are not completed, and sends a reminder.
//   2. TASK REMINDER IMMEDIATE — called by the frontend when a task is created
//      less than 1 hour before its due time; sends a reminder right away.
//
// ── How to activate ──────────────────────────────────────────────────────
//   1. Sign up at https://resend.com and get an API key
//   2. Set the secret:  supabase secrets set RESEND_API_KEY=re_xxxxx
//   3. Deploy:  supabase functions deploy send-email-reminders
//   4. Run the SQL in migration.sql (section 10) to set up pg_cron
// ─────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = "HabitOT <notifications@itsbydan.com>";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Email sender via Resend ─────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });

  if (!res.ok) {
    console.error("Resend error:", await res.text());
  }
  return res.ok;
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
      <p>Log in to <a href="https://habitot.app/patient" style="color: #863bff;">HabitOT</a> to complete it.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #9ca3af;">
        You received this because email reminders are enabled on your HabitOT account.
      </p>
    </div>
  `;
}

function formatTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toLocaleTimeString("en-US", {
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

// ── 1. Patient reminder: tasks due in next 15 minutes (called by pg_cron) ──
async function checkPatientReminders() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Look for tasks due in the next 15 minutes
  const windowStart = currentMinutes;
  const windowEnd = currentMinutes + 15;

  const toHHMM = (totalMins: number) => {
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  if (windowEnd >= 24 * 60) return;

  const startTime = toHHMM(windowStart);
  const endTime = toHHMM(windowEnd);

  // Find tasks due in this window that are NOT completed
  const { data: tasks } = await supabase
    .from("task_assignments")
    .select("id, title, assigned_date, assigned_time, patient_id")
    .eq("assigned_date", today)
    .neq("status", "completed")
    .gte("assigned_time", startTime)
    .lte("assigned_time", endTime);

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
    const patientTasks = byPatient[patient.id];
    if (!patientTasks || patientTasks.length === 0) continue;

    for (const task of patientTasks) {
      const emailType = `patient_task_reminder_${task.id}`;
      if (await alreadySent(patient.id, emailType, today)) continue;

      const fTime = formatTime(task.assigned_date, task.assigned_time);
      const fDate = formatDate(task.assigned_date);
      const firstName = patient.full_name?.split(" ")[0] || "there";

      const subject = `HabitOT — Reminder: "${task.title}" is due at ${fTime}`;
      const html = buildReminderHtml(firstName, task.title, fDate, fTime);

      const sent = await sendEmail(patient.email, subject, html);
      if (sent) await logEmail(patient.id, emailType, today);
    }
  }
}

// ── 2. Immediate reminder: task created < 1 hour before due time ───────
async function sendTaskReminderImmediate(patientId: string, taskTitle: string, assignedDate: string, assignedTime: string) {
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

  await sendEmail(patient.email, subject, html);
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

    // pg_cron calls this every 15 minutes
    if (type === "patient" || type === "all") {
      await checkPatientReminders();
    }

    // Frontend calls this when task is created < 1 hour before due time
    if (type === "task_reminder_immediate") {
      const { patient_id, title, assigned_date, assigned_time } = body;
      await sendTaskReminderImmediate(patient_id, title, assigned_date, assigned_time);
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
