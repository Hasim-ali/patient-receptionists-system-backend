// utils/scheduler.js — Daily cron jobs with clinic plan gating
//   08:00 → send appointment reminders  (premium clinics only)
//   20:00 → detect skipped appointments  (all clinics)
//             → send reschedule offer to premium-subscription patients
//               only if their clinic plan is premium

const cron = require('node-cron');
const db = require('../db');
const { sendWhatsAppMessage } = require('./whatsapp');

function startScheduler() {

  // ── Job 1: Reminders at 08:00 daily ────────────────────────────────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] ── Reminder job started ──────────────────────────────');
    try {
      const today = new Date().toISOString().split('T')[0];

      const [rows] = await db.query(`
        SELECT
          a.id,
          TIME_FORMAT(a.appointment_time, '%H:%i') AS appt_time,
          p.name  AS patient_name,
          p.phone AS patient_phone,
          d.name  AS doctor_name,
          c.plan  AS clinic_plan
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN doctors  d ON a.doctor_id  = d.id
        JOIN clinics  c ON a.clinic_id  = c.id
        WHERE a.appointment_date = ?
          AND a.status   = 'booked'
          AND a.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND d.deleted_at IS NULL
          AND c.deleted_at IS NULL
      `, [today]);

      for (const appt of rows) {
        const msg =
          `Reminder: You have an appointment today at ${appt.appt_time} ` +
          `with ${appt.doctor_name}. Please visit on time.`;

        const result = await sendWhatsAppMessage(
          appt.patient_phone, msg, appt.clinic_plan, 'reminder'
        );
        console.log(
          `[CRON] Reminder appt#${appt.id} plan:${appt.clinic_plan} → ` +
          (result.success ? '✅ sent' : `⏭  skipped (${result.reason || result.error?.type})`)
        );
      }
    } catch (err) {
      console.error('[CRON] Reminder job error:', err.message);
    }
    console.log('[CRON] ── Reminder job done ───────────────────────────────');
  });

  // ── Job 2: Skip detection at 20:00 daily ───────────────────────────────────
  cron.schedule('0 20 * * *', async () => {
    console.log('[CRON] ── Skip detection job started ────────────────────────');
    try {
      const today = new Date().toISOString().split('T')[0];

      // All past 'booked' appointments that were never marked visited
      const [rows] = await db.query(`
        SELECT
          a.id,
          a.appointment_date,
          TIME_FORMAT(a.appointment_time, '%H:%i') AS appt_time,
          a.clinic_id,
          p.name         AS patient_name,
          p.phone        AS patient_phone,
          d.name         AS doctor_name,
          c.plan         AS clinic_plan,
          c.subscription AS clinic_sub    -- ← moved from p.subscription to c.subscription
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        JOIN doctors  d ON a.doctor_id  = d.id
        JOIN clinics  c ON a.clinic_id  = c.id
        WHERE a.appointment_date < ?
          AND a.status   = 'booked'
          AND a.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND d.deleted_at IS NULL
          AND c.deleted_at IS NULL
      `, [today]);

      for (const appt of rows) {
        // 1. Mark as skipped
        await db.query(
          `UPDATE appointments SET status = 'skipped' WHERE id = ?`,
          [appt.id]
        );
        console.log(`[CRON] appt#${appt.id} marked skipped`);

        // 2. Send reschedule offer only to premium clinics
        //    (free clinics get no WhatsApp at all)
        if (appt.clinic_sub === 'premium') {   // ← appt.patient_sub → appt.clinic_sub
          const msg =
            `Hello ${appt.patient_name}, you missed your appointment with ${appt.doctor_name} ` +
            `on ${appt.appointment_date} at ${appt.appt_time}. ` +
            `Would you like to book the next available slot? ` +
            `Call us or reply YES to confirm. (Ref ID: ${appt.id})`;

          const result = await sendWhatsAppMessage(
            appt.patient_phone, msg, appt.clinic_plan, 'skip'
          );
          console.log(
            `[CRON] Skip notice appt#${appt.id} plan:${appt.clinic_plan} → ` +
            (result.success ? '✅ sent' : `⏭  skipped (${result.reason || 'send error'})`)
          );
        }
      }
    } catch (err) {
      console.error('[CRON] Skip detection error:', err.message);
    }
    console.log('[CRON] ── Skip detection job done ───────────────────────────');
  });

  console.log('[Scheduler] ✅ Cron jobs registered — reminders @08:00, skip-check @20:00');
}

module.exports = { startScheduler };