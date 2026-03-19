// scheduler.js — Daily cron jobs: reminders + skip detection
const cron = require('node-cron');
const db   = require('../db');
const { sendWhatsAppMessage } = require('./whatsapp');

function startScheduler() {

  // ── Job 1: Send reminders at 08:00 every day ──────────────────────────────
  // For every appointment with status='booked' and date=TODAY, send reminder.
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Running daily reminder job...');
    try {
      const today = new Date().toISOString().split('T')[0];
      const [rows] = await db.query(
        `SELECT a.id, a.appointment_time,
                p.name AS patient_name, p.phone AS patient_phone,
                d.name AS doctor_name
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         JOIN doctors  d ON a.doctor_id  = d.id
         WHERE a.appointment_date = ? AND a.status = 'booked'`,
        [today]
      );
      for (const appt of rows) {
        const msg = `Reminder: You have an appointment today at ${appt.appointment_time.slice(0,5)} with ${appt.doctor_name}. Please visit on time.`;
        await sendWhatsAppMessage(appt.patient_phone, msg);
        console.log(`[CRON] Reminder sent for appointment ID ${appt.id}`);
      }
    } catch (err) {
      console.error('[CRON] Reminder job error:', err.message);
    }
  });

  // ── Job 2: Skip detection at 20:00 every day ──────────────────────────────
  // Appointments whose date < TODAY and status is still 'booked' are skipped.
  // If patient subscription = 'premium', send reschedule offer via WhatsApp.
  cron.schedule('0 20 * * *', async () => {
    console.log('[CRON] Running skip detection job...');
    try {
      const today = new Date().toISOString().split('T')[0];
      const [rows] = await db.query(
        `SELECT a.id, a.appointment_date, a.appointment_time,
                p.name AS patient_name, p.phone AS patient_phone,
                p.subscription,
                d.name AS doctor_name, d.id AS doctor_id
         FROM appointments a
         JOIN patients p ON a.patient_id = p.id
         JOIN doctors  d ON a.doctor_id  = d.id
         WHERE a.appointment_date < ? AND a.status = 'booked'`,
        [today]
      );

      for (const appt of rows) {
        // Mark as skipped
        await db.query(
          `UPDATE appointments SET status = 'skipped' WHERE id = ?`,
          [appt.id]
        );
        console.log(`[CRON] Appointment ID ${appt.id} marked as skipped`);

        // Premium patients: send reschedule offer
        if (appt.subscription === 'premium') {
          const msg =
            `Hello ${appt.patient_name}, you skipped your appointment with ${appt.doctor_name} ` +
            `on ${appt.appointment_date}. ` +
            `Would you like to schedule the next available slot? ` +
            `Reply YES to this number or call the clinic to confirm reschedule. ` +
            `(Reference appointment ID: ${appt.id})`;
          await sendWhatsAppMessage(appt.patient_phone, msg);
        }
      }
    } catch (err) {
      console.error('[CRON] Skip detection job error:', err.message);
    }
  });

  console.log('[Scheduler] Cron jobs registered (reminders @ 08:00, skip-check @ 20:00)');
}

module.exports = { startScheduler };