const db = require('../db');
const { sendWhatsAppMessage } = require('../utils/whatsapp');
const { generateSlots } = require('../utils/slots');

// ── Helper: find first free slot for a doctor on a given date ─────────────
async function findFreeSlot(doctorId, date) {
  const allSlots = generateSlots();
  const [booked] = await db.query(
    `SELECT TIME_FORMAT(appointment_time, '%H:%i:%s') AS t
     FROM appointments
     WHERE doctor_id = ? AND appointment_date = ? AND status = 'booked'`,
    [doctorId, date]
  );
  const bookedSet = new Set(booked.map(r => r.t));
  return allSlots.find(s => !bookedSet.has(s)) || null;
}

// ── POST /api/book-appointment ─────────────────────────────────────────────
// Body: { patient_id, doctor_id, appointment_date }
async function bookAppointment(req, res) {
  const { patient_id, doctor_id, appointment_date } = req.body;

  if (!patient_id || !doctor_id || !appointment_date) {
    return res.status(400).json({ error: 'patient_id, doctor_id, and appointment_date are required' });
  }

  try {
    // 1. Check doctor exists
    const [doctors] = await db.query('SELECT * FROM doctors WHERE id = ?', [doctor_id]);
    if (doctors.length === 0) return res.status(404).json({ error: 'Doctor not found' });

    // 2. Check patient exists
    const [patients] = await db.query('SELECT * FROM patients WHERE id = ?', [patient_id]);
    if (patients.length === 0) return res.status(404).json({ error: 'Patient not found' });

    // 3. Find free slot
    const freeSlot = await findFreeSlot(doctor_id, appointment_date);
    if (!freeSlot) {
      return res.status(409).json({ error: 'No free slots available for this doctor on the selected date' });
    }

    // 4. Book the slot
    const [result] = await db.query(
      `INSERT INTO appointments (doctor_id, patient_id, appointment_date, appointment_time, status)
       VALUES (?, ?, ?, ?, 'booked')`,
      [doctor_id, patient_id, appointment_date, freeSlot]
    );

    // 5. Send WhatsApp confirmation
    const doctor  = doctors[0];
    const patient = patients[0];
    const msg =
      `Hello ${patient.name}, your appointment has been booked with ${doctor.name} ` +
      `on ${appointment_date} at ${freeSlot.slice(0,5)}. Please be on time.`;
    await sendWhatsAppMessage(patient.phone, msg);

    return res.status(200).json({
      message: 'Appointment booked successfully',
      appointment: {
        id: result.insertId,
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

// ── POST /api/mark-visited/:id ─────────────────────────────────────────────
async function markVisited(req, res) {
  const { id } = req.params;
  try {
    const [appts] = await db.query('SELECT * FROM appointments WHERE id = ?', [id]);
    if (appts.length === 0) return res.status(404).json({ error: 'Appointment not found' });

    await db.query(`UPDATE appointments SET status = 'visited' WHERE id = ?`, [id]);
    return res.status(200).json({ message: 'Appointment marked as visited', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/reschedule-confirm ───────────────────────────────────────────
// Body: { appointment_id, response: 'yes'|'no' }
// Called by receptionist when patient responds to the reschedule WhatsApp offer.
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
    // Load the skipped appointment
    const [appts] = await db.query(
      `SELECT a.*, p.name AS patient_name, p.phone AS patient_phone,
              d.name AS doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors  d ON a.doctor_id  = d.id
       WHERE a.id = ? AND a.status = 'skipped'`,
      [appointment_id]
    );
    if (appts.length === 0) {
      return res.status(404).json({ error: 'Skipped appointment not found' });
    }

    const appt = appts[0];

    // Find next available date starting from tomorrow
    let nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    let freeSlot = null;
    let attempts = 0;

    while (!freeSlot && attempts < 30) { // look up to 30 days ahead
      const dateStr = nextDate.toISOString().split('T')[0];
      freeSlot = await findFreeSlot(appt.doctor_id, dateStr);
      if (!freeSlot) {
        nextDate.setDate(nextDate.getDate() + 1);
      } else {
        // Found a free slot on dateStr
        const [result] = await db.query(
          `INSERT INTO appointments (doctor_id, patient_id, appointment_date, appointment_time, status)
           VALUES (?, ?, ?, ?, 'booked')`,
          [appt.doctor_id, appt.patient_id, dateStr, freeSlot]
        );

        const msg =
          `Hello ${appt.patient_name}, your rescheduled appointment is confirmed with ` +
          `${appt.doctor_name} on ${dateStr} at ${freeSlot.slice(0,5)}.`;
        await sendWhatsAppMessage(appt.patient_phone, msg);

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
      attempts++;
    }

    return res.status(409).json({ error: 'No free slots found in the next 30 days' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/appointments ──────────────────────────────────────────────────
async function getAppointments(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.status,
              p.id AS patient_id, p.name AS patient_name, p.phone AS patient_phone, p.subscription,
              d.id AS doctor_id, d.name AS doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors  d ON a.doctor_id  = d.id
       ORDER BY a.appointment_date DESC, a.appointment_time ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { bookAppointment, markVisited, rescheduleConfirm, getAppointments };