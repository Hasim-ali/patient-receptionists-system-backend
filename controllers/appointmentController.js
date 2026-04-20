// controllers/appointmentController.js
const db = require('../db');
const { sendWhatsAppMessage } = require('../utils/whatsapp');

// ── Helper: find first free 30-min slot for a doctor on a given date ──────────
// Slot generation logic:
//   1. available_days (comma-separated string on doctors table)
//      → if set, booking is rejected if the date falls on an absent day
//   2. doctor_availability table (per-day start/end times)
//      → if record exists for that day, slots generated from those hours
//      → if no record, default hours 09:00–16:30 are used
async function findFreeSlot(doctorId, date) {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Parse date string safely (avoid timezone shift from `new Date(date)`)
  const dayOfWeek = DAY_NAMES[new Date(`${date}T00:00:00`).getDay()];

  // ── 1. Check available_days gate ──────────────────────────────────────────
  const [doctorRows] = await db.query(
    'SELECT available_days FROM doctors WHERE id = ? AND deleted_at IS NULL', [doctorId]
  );
  if (doctorRows.length > 0 && doctorRows[0].available_days) {
    const days = doctorRows[0].available_days.split(',').map(d => d.trim());
    if (!days.includes(dayOfWeek)) {
      return null; // Doctor not available on this day of week
    }
  }

  // ── 2. Get working hours for this day ─────────────────────────────────────
  const [avail] = await db.query(
    `SELECT TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time,   '%H:%i:%s') AS end_time
     FROM doctor_availability
     WHERE doctor_id = ? AND day_of_week = ? AND deleted_at IS NULL
     LIMIT 1`,
    [doctorId, dayOfWeek]
  );

  let startH = 9, startM = 0, endH = 16, endM = 30; // Default hours
  if (avail.length > 0) {
    [startH, startM] = avail[0].start_time.split(':').map(Number);
    [endH, endM] = avail[0].end_time.split(':').map(Number);
  }

  // ── 3. Generate all 30-min slots within working hours ─────────────────────
  const allSlots = [];
  let h = startH, m = startM;
  while (h < endH || (h === endH && m <= endM)) {
    allSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    m += 30;
    if (m >= 60) { m -= 60; h++; }
  }

  // ── 4. Remove already-booked slots ────────────────────────────────────────
  const [booked] = await db.query(
    `SELECT TIME_FORMAT(appointment_time, '%H:%i:%s') AS t
     FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND status = 'booked' AND deleted_at IS NULL`,
    [doctorId, date]
  );
  const bookedSet = new Set(booked.map(r => r.t));

  return allSlots.find(s => !bookedSet.has(s)) || null;
}

// ── POST /api/book-appointment ─────────────────────────────────────────────────
// Body: { patient_id, doctor_id, appointment_date, clinic_id? (super_admin only) }
async function bookAppointment(req, res) {
  const { patient_id, doctor_id, appointment_date } = req.body;
  if (!patient_id || !doctor_id || !appointment_date) {
    return res.status(400).json({ error: 'patient_id, doctor_id, and appointment_date are required' });
  }

  try {
    // Fetch doctor + clinic plan in one join
    const [doctors] = await db.query(`
      SELECT d.*, c.plan AS clinic_plan
      FROM doctors d
      JOIN clinics c ON d.clinic_id = c.id
      WHERE d.id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL
    `, [doctor_id]);
    if (doctors.length === 0) return res.status(404).json({ error: 'Doctor not found' });

    const [patients] = await db.query(
      'SELECT * FROM patients WHERE id = ? AND deleted_at IS NULL', [patient_id]
    );
    if (patients.length === 0) return res.status(404).json({ error: 'Patient not found' });

    const doctor = doctors[0];
    const patient = patients[0];

    // Scope: patient and doctor must belong to the same clinic
    if (patient.clinic_id !== doctor.clinic_id) {
      return res.status(400).json({ error: 'Patient and doctor must belong to the same clinic' });
    }
    if (req.scopedClinicId && doctor.clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied: doctor belongs to a different clinic' });
    }

    // Find free slot (respects available_days + doctor_availability)
    const freeSlot = await findFreeSlot(doctor_id, appointment_date);
    if (!freeSlot) {
      return res.status(409).json({
        error: 'No free slots available for this doctor on the selected date (doctor may not work that day or all slots are full)'
      });
    }

    // Book
    const [result] = await db.query(`
      INSERT INTO appointments
        (clinic_id, doctor_id, patient_id, appointment_date, appointment_time, status, created_by)
      VALUES (?, ?, ?, ?, ?, 'booked', ?)
    `, [doctor.clinic_id, doctor_id, patient_id, appointment_date, freeSlot, req.user.id]);

    // WhatsApp confirmation (gated by clinic plan)
    const msg =
      `Hello ${patient.name}, your appointment has been booked with ${doctor.name} ` +
      `on ${appointment_date} at ${freeSlot.slice(0, 5)}. Please be on time.`;
    await sendWhatsAppMessage(patient.phone, msg, doctor.clinic_plan, 'confirmation');

    return res.status(200).json({
      message: 'Appointment booked successfully',
      appointment: {
        id: result.insertId,
        clinic_id: doctor.clinic_id,
        doctor_name: doctor.name,
        patient_name: patient.name,
        appointment_date,
        appointment_time: freeSlot,
        status: 'booked'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/mark-visited/:id ─────────────────────────────────────────────────
async function markVisited(req, res) {
  const { id } = req.params;
  try {
    const [appts] = await db.query(
      'SELECT * FROM appointments WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (appts.length === 0) return res.status(404).json({ error: 'Appointment not found' });

    if (req.scopedClinicId && appts[0].clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query(
      `UPDATE appointments SET status = 'visited', updated_by = ? WHERE id = ?`,
      [req.user.id, id]
    );
    return res.status(200).json({ message: 'Appointment marked as visited', id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/reschedule-confirm ───────────────────────────────────────────────
// Body: { appointment_id, response: 'yes'|'no' }
// Searches up to 30 days ahead for the next free slot for the same doctor.
async function rescheduleConfirm(req, res) {
  const { appointment_id, response } = req.body;
  if (!appointment_id || !response) {
    return res.status(400).json({ error: 'appointment_id and response (yes/no) are required' });
  }
  if (response.toLowerCase() === 'no') {
    return res.status(200).json({ message: 'Patient declined reschedule. No action taken.' });
  }
  if (response.toLowerCase() !== 'yes') {
    return res.status(400).json({ error: 'response must be yes or no' });
  }

  try {
    const [appts] = await db.query(`
      SELECT a.*,
             p.name  AS patient_name,
             p.phone AS patient_phone,
             d.name  AS doctor_name,
             c.plan  AS clinic_plan
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors  d ON a.doctor_id  = d.id
      JOIN clinics  c ON a.clinic_id  = c.id
      WHERE a.id = ? AND a.status = 'skipped' AND a.deleted_at IS NULL
    `, [appointment_id]);

    if (appts.length === 0) {
      return res.status(404).json({ error: 'Skipped appointment not found' });
    }

    const appt = appts[0];
    if (req.scopedClinicId && appt.clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Search next 30 days for a free slot
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);

    for (let i = 0; i < 30; i++) {
      const dateStr = nextDate.toISOString().split('T')[0];
      const freeSlot = await findFreeSlot(appt.doctor_id, dateStr);

      if (freeSlot) {
        const [result] = await db.query(`
          INSERT INTO appointments
            (clinic_id, doctor_id, patient_id, appointment_date, appointment_time, status, created_by)
          VALUES (?, ?, ?, ?, ?, 'booked', ?)
        `, [appt.clinic_id, appt.doctor_id, appt.patient_id, dateStr, freeSlot, req.user.id]);

        const msg =
          `Hello ${appt.patient_name}, your rescheduled appointment is confirmed with ` +
          `${appt.doctor_name} on ${dateStr} at ${freeSlot.slice(0, 5)}.`;
        await sendWhatsAppMessage(appt.patient_phone, msg, appt.clinic_plan, 'reschedule');

        return res.status(200).json({
          message: 'Appointment rescheduled successfully',
          appointment: {
            id: result.insertId,
            doctor_name: appt.doctor_name,
            patient_name: appt.patient_name,
            appointment_date: dateStr,
            appointment_time: freeSlot,
            status: 'booked'
          }
        });
      }
      nextDate.setDate(nextDate.getDate() + 1);
    }

    return res.status(409).json({ error: 'No free slots found in the next 30 days' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/appointments ──────────────────────────────────────────────────────
async function getAppointments(req, res) {
  try {
    let sql = `
      SELECT
        a.id, a.appointment_date, a.appointment_time, a.status, a.created_at,
        p.id AS patient_id, p.name AS patient_name, p.phone AS patient_phone, p.subscription,
        d.id AS doctor_id,  d.name AS doctor_name,
        c.id AS clinic_id,  c.name AS clinic_name,  c.plan AS clinic_plan
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors  d ON a.doctor_id  = d.id
      JOIN clinics  c ON a.clinic_id  = c.id
      WHERE a.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND d.deleted_at IS NULL
        AND c.deleted_at IS NULL`;
    const params = [];

    if (req.scopedClinicId) {
      sql += ' AND a.clinic_id = ?';
      params.push(req.scopedClinicId);
    }
    sql += ' ORDER BY a.appointment_date DESC, a.appointment_time ASC';

    const [rows] = await db.query(sql, params);
    res.json({ status: 0, success: true, data: rows, message: "Successfuly" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { bookAppointment, markVisited, rescheduleConfirm, getAppointments };