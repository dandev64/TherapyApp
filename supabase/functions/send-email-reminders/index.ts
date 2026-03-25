// =============================================================================
// HabitOT — Email Reminder Edge Function
// =============================================================================
//
// This Supabase Edge Function sends two types of email reminders:
//   1. THERAPIST REMINDER — sent each morning if a therapist has patients
//      with no tasks assigned for today.
//   2. PATIENT REMINDER — sent when a patient hasn't completed a task past
//      its scheduled time of day (morning=12pm, afternoon=5pm, evening=9pm).
//
// CURRENTLY COMMENTED OUT to avoid using Supabase free tier resources.
//
// ── How to activate ──────────────────────────────────────────────────────
//   1. Sign up at https://resend.com and get an API key
//   2. Set the secret:  supabase secrets set RESEND_API_KEY=re_xxxxx
//   3. Uncomment ALL the code below
//   4. Deploy:  supabase functions deploy send-email-reminders
//   5. Run the SQL in  migration_email_notifications.sql  to set up pg_cron
// ─────────────────────────────────────────────────────────────────────────

/*
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
        .eq("assigned_date", today)
        .eq("is_rest_day", false);

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

// ── 2. Patient reminder: incomplete tasks past scheduled time ───────────
async function checkPatientReminders() {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const currentHour = now.getUTCHours(); // Adjust for your timezone

  // Determine which time slots have passed
  // morning → reminder at 12pm, afternoon → 5pm, evening → 9pm
  const overdueSlots: string[] = [];
  if (currentHour >= 12) overdueSlots.push("morning");
  if (currentHour >= 17) overdueSlots.push("afternoon");
  if (currentHour >= 21) overdueSlots.push("evening");

  if (overdueSlots.length === 0) return;

  // Get patients who opted in
  const { data: patients } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "patient")
    .eq("email_notifications_enabled", true);

  if (!patients || patients.length === 0) return;

  for (const patient of patients) {
    for (const slot of overdueSlots) {
      const emailType = `patient_overdue_${slot}`;
      if (await alreadySent(patient.id, emailType, today)) continue;

      // Check for incomplete tasks in this time slot
      const { data: incompleteTasks } = await supabase
        .from("task_assignments")
        .select("title")
        .eq("patient_id", patient.id)
        .eq("assigned_date", today)
        .eq("assigned_time_of_day", slot)
        .eq("is_rest_day", false)
        .neq("status", "completed");

      if (!incompleteTasks || incompleteTasks.length === 0) continue;

      const taskNames = incompleteTasks.map((t) => t.title).join(", ");
      const subject = `HabitOT — You have ${incompleteTasks.length} incomplete ${slot} task(s)`;
      const html = `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #2c3436;">Hi ${patient.full_name?.split(" ")[0]}!</h2>
          <p>You still have incomplete ${slot} tasks for today:</p>
          <p style="font-weight: bold; color: #f59e0b;">${taskNames}</p>
          <p>Log in to <a href="https://habitot.app/patient" style="color: #863bff;">HabitOT</a> to complete them.</p>
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
*/
