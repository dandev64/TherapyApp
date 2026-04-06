// =============================================================================
// HabitOT — Email Reminder Edge Function
// =============================================================================
//
// This Supabase Edge Function sends two types of email reminders:
//   1. THERAPIST REMINDER — sent each morning if a therapist has patients
//      with no tasks assigned for today.
//   2. PATIENT REMINDER — sent 1 hour before a task's assigned_time if the
//      task has not yet been completed.
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
const FROM_EMAIL = "HabitOT <notifications@habitot.app>"; // Change to your verified domain

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

// ── 1. Therapist reminder: patients with no tasks today ─────────────────
async function checkTherapistReminders() {
  const today = new Date().toISOString().split("T")[0];

  // Get all therapists who have opted in to email notifications
  const { data: therapists } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "therapist")
    .eq("email_notifications_enabled", true);

  if (!therapists || therapists.length === 0) return;

  for (const therapist of therapists) {
    // Skip if already emailed today
    if (await alreadySent(therapist.id, "therapist_no_tasks", today)) continue;

    // Get therapist's patients
    const { data: assignments } = await supabase
      .from("patient_assignments")
      .select("patient_id, profiles!patient_assignments_patient_id_fkey(full_name)")
      .eq("assigned_to", therapist.id)
      .eq("relationship", "therapist");

    if (!assignments || assignments.length === 0) continue;

    // Check which patients have no tasks today from this therapist
    const patientsWithoutTasks: string[] = [];
    for (const a of assignments) {
      const { count } = await supabase
        .from("task_assignments")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", a.patient_id)
        .eq("therapist_id", therapist.id)
        .eq("assigned_date", today);

      if ((count || 0) === 0) {
        patientsWithoutTasks.push((a as any).profiles?.full_name || "A patient");
      }
    }

    if (patientsWithoutTasks.length === 0) continue;

    const patientList = patientsWithoutTasks.join(", ");
    const subject = `HabitOT — ${patientsWithoutTasks.length} patient(s) have no tasks today`;
    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #2c3436;">Good morning, ${therapist.full_name?.split(" ")[0]}!</h2>
        <p>The following patient(s) don't have any tasks assigned for today:</p>
        <p style="font-weight: bold; color: #ef4444;">${patientList}</p>
        <p>Log in to <a href="https://habitot.app/therapist/patients" style="color: #863bff;">HabitOT</a> to assign tasks.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #9ca3af;">
          You received this because email reminders are enabled on your HabitOT account.
        </p>
      </div>
    `;

    const sent = await sendEmail(therapist.email, subject, html);
    if (sent) await logEmail(therapist.id, "therapist_no_tasks", today);
  }
}

// ── 2. Patient reminder: 1 hour before task assigned_time ───────────────
async function checkPatientReminders() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Look for tasks whose assigned_time is ~1 hour from now (45–75 min window
  // to account for the 15-minute cron interval and slight drift)
  const windowStart = currentMinutes + 45;
  const windowEnd = currentMinutes + 75;

  // Format window bounds as HH:MM strings for comparison
  const toHHMM = (totalMins: number) => {
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  // If window crosses midnight (e.g. 23:30 + 75min), skip — edge case unlikely for therapy tasks
  if (windowEnd >= 24 * 60) return;

  const startTime = toHHMM(windowStart);
  const endTime = toHHMM(windowEnd);

  // Get incomplete tasks for today that fall within the reminder window
  const { data: tasks } = await supabase
    .from("task_assignments")
    .select("id, title, assigned_time, patient_id")
    .eq("assigned_date", today)
    .neq("status", "completed")
    .gte("assigned_time", startTime)
    .lte("assigned_time", endTime);

  if (!tasks || tasks.length === 0) return;

  // Group tasks by patient
  const byPatient: Record<string, typeof tasks> = {};
  for (const task of tasks) {
    if (!byPatient[task.patient_id]) byPatient[task.patient_id] = [];
    byPatient[task.patient_id].push(task);
  }

  // Get patients who opted in to email notifications
  const patientIds = Object.keys(byPatient);
  const { data: patients } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "patient")
    .eq("email_notifications_enabled", true)
    .in("id", patientIds);

  if (!patients || patients.length === 0) return;

  for (const patient of patients) {
    const patientTasks = byPatient[patient.id];
    if (!patientTasks || patientTasks.length === 0) continue;

    // Use a dedup key per patient per task so each task only triggers one reminder
    for (const task of patientTasks) {
      const emailType = `patient_task_reminder_${task.id}`;
      if (await alreadySent(patient.id, emailType, today)) continue;

      const formattedTime = new Date(`${today}T${task.assigned_time}:00`).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      const subject = `HabitOT — Reminder: "${task.title}" is due at ${formattedTime}`;
      const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #2c3436;">Hi ${patient.full_name?.split(" ")[0]}!</h2>
          <p>Friendly reminder — you have a task coming up in about <strong>1 hour</strong>:</p>
          <div style="background: #f8f9fa; border-left: 4px solid #863bff; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; font-weight: bold; color: #2c3436;">${task.title}</p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">Due at ${formattedTime}</p>
          </div>
          <p>Log in to <a href="https://habitot.app/patient" style="color: #863bff;">HabitOT</a> to complete it.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #9ca3af;">
            You received this because email reminders are enabled on your HabitOT account.
          </p>
        </div>
      `;

      const sent = await sendEmail(patient.email, subject, html);
      if (sent) await logEmail(patient.id, emailType, today);
    }
  }
}

// ── HTTP Handler ────────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const { type } = await req.json().catch(() => ({ type: "all" }));

    if (type === "therapist" || type === "all") {
      await checkTherapistReminders();
    }
    if (type === "patient" || type === "all") {
      await checkPatientReminders();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Email reminder error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
