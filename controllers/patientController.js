// controllers/patientController.js
const db = require('../db');

// ── GET /api/patients ──────────────────────────────────────────────────────────
async function getPatients(req, res) {
  try {
    let sql = `
      SELECT p.*, c.name AS clinic_name
      FROM patients p
      JOIN clinics c ON p.clinic_id = c.id
      WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL`;
    const params = [];

    if (req.scopedClinicId) {
      sql += ' AND p.clinic_id = ?';
      params.push(req.scopedClinicId);
    }
    sql += ' ORDER BY p.id ASC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/patients/:id ──────────────────────────────────────────────────────
async function getPatientById(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT p.*, c.name AS clinic_name
      FROM patients p
      JOIN clinics c ON p.clinic_id = c.id
      WHERE p.id = ? AND p.deleted_at IS NULL AND c.deleted_at IS NULL
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    if (req.scopedClinicId && rows[0].clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied: patient belongs to a different clinic' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/patients ─────────────────────────────────────────────────────────
// If patient with same phone already exists in the clinic → return existing (idempotent).
// Body: { name, phone, subscription, clinic_id? }
async function createOrGetPatient(req, res) {
  const { name, phone, subscription } = req.body;

  const effectiveClinicId = (req.user.role === 'super_admin')
    ? req.body.clinic_id
    : req.user.clinic_id;

  if (!name || !phone || !subscription) {
    return res.status(400).json({ error: 'name, phone, and subscription are required' });
  }
  if (!effectiveClinicId) {
    return res.status(400).json({ error: 'clinic_id is required (super_admin must supply it in body)' });
  }
  if (!['basic', 'premium'].includes(subscription)) {
    return res.status(400).json({ error: 'subscription must be basic or premium' });
  }

  try {
    // Idempotency: same phone + same clinic → return existing
    const [existing] = await db.query(
      'SELECT * FROM patients WHERE phone = ? AND clinic_id = ? AND deleted_at IS NULL',
      [phone, effectiveClinicId]
    );
    if (existing.length > 0) {
      return res.status(200).json({ patient: existing[0], created: false });
    }

    const [result] = await db.query(
      'INSERT INTO patients (clinic_id, name, phone, subscription, created_by) VALUES (?, ?, ?, ?, ?)',
      [effectiveClinicId, name, phone, subscription, req.user.id]
    );
    const [newPatient] = await db.query('SELECT * FROM patients WHERE id = ?', [result.insertId]);
    return res.status(201).json({ patient: newPatient[0], created: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── PATCH /api/patients/:id ────────────────────────────────────────────────────
// clinic_admin and above only
async function updatePatient(req, res) {
  const { id } = req.params;
  const { name, phone, subscription } = req.body;

  if (subscription && !['basic', 'premium'].includes(subscription)) {
    return res.status(400).json({ error: 'subscription must be basic or premium' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM patients WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    if (req.scopedClinicId && rows[0].clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied: patient belongs to a different clinic' });
    }

    const p = rows[0];
    await db.query(
      'UPDATE patients SET name=?, phone=?, subscription=?, updated_by=? WHERE id=?',
      [name ?? p.name, phone ?? p.phone, subscription ?? p.subscription, req.user.id, id]
    );

    const [updated] = await db.query('SELECT * FROM patients WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api/patients/:id ───────────────────────────────────────────────────
// clinic_admin and above only — soft delete
async function deletePatient(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT * FROM patients WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    if (req.scopedClinicId && rows[0].clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied: patient belongs to a different clinic' });
    }

    await db.query(
      'UPDATE patients SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
      [req.user.id, id]
    );
    res.json({ message: 'Patient soft-deleted successfully', id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getPatients, getPatientById, createOrGetPatient, updatePatient, deletePatient };