// controllers/clinicController.js
const db = require('../db');

const VALID_PLANS = ['free', 'basic', 'premium'];
const VALID_SUBSCRIPTIONS = ['basic', 'premium'];  // ← new constant

// ── GET /api/clinics ───────────────────────────────────────────────────────────
// super_admin: returns all non-deleted clinics (or one if ?clinic_id= passed)
// others:      returns only their own clinic
async function getClinics(req, res) {
  try {
    let sql = 'SELECT * FROM clinics WHERE deleted_at IS NULL';
    const params = [];

    if (req.scopedClinicId) {
      sql += ' AND id = ?';
      params.push(req.scopedClinicId);
    }
    sql += ' ORDER BY id ASC';

    const [rows] = await db.query(sql, params);
    res.json({ status: 0, success: true, data: rows, message: "Saved Successfuly" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/clinics/:id ──────────────────────────────────────────────────────
async function getClinicById(req, res) {
  const { id } = req.params;

  // Non-super_admin can only read their own clinic
  if (req.user.role !== 'super_admin' && parseInt(id) !== req.user.clinic_id) {
    return res.status(403).json({ error: 'Access denied: you can only view your own clinic' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM clinics WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Clinic not found' });
    res.json({ status: 0, success: true, data: rows[0], message: "Saved Successfuly" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/clinics ──────────────────────────────────────────────────────────
// super_admin only
async function createClinic(req, res) {
  const { name, address, phone, email, plan, subscription } = req.body;  // ← subscription added

  if (!name) return res.status(400).json({ error: 'name is required' });

  if (plan && !VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
  }
  // ↓ subscription validation
  if (subscription && !VALID_SUBSCRIPTIONS.includes(subscription)) {
    return res.status(400).json({ error: `subscription must be one of: ${VALID_SUBSCRIPTIONS.join(', ')}` });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO clinics (name, address, phone, email, plan, subscription, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,  // ← subscription added
      [name, address || null, phone || null, email || null, plan || 'free', subscription || 'basic', req.user.id]
    );
    const [clinic] = await db.query('SELECT * FROM clinics WHERE id = ?', [result.insertId]);
    return res.status(201).json(clinic[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── PATCH /api/clinics/:id ─────────────────────────────────────────────────────
// super_admin only — partial update
async function updateClinic(req, res) {
  const { id } = req.params;
  const { name, address, phone, email, plan, subscription } = req.body;  // ← subscription added

  if (plan && !VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(', ')}` });
  }
  // ↓ subscription validation
  if (subscription && !VALID_SUBSCRIPTIONS.includes(subscription)) {
    return res.status(400).json({ error: `subscription must be one of: ${VALID_SUBSCRIPTIONS.join(', ')}` });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM clinics WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Clinic not found' });

    const c = rows[0];
    await db.query(
      `UPDATE clinics
       SET name=?, address=?, phone=?, email=?, plan=?, subscription=?, updated_by=?
       WHERE id=?`,  // ← subscription added
      [
        name         ?? c.name,
        address      ?? c.address,
        phone        ?? c.phone,
        email        ?? c.email,
        plan         ?? c.plan,
        subscription ?? c.subscription,  // ← subscription added
        req.user.id,
        id
      ]
    );

    const [updated] = await db.query('SELECT * FROM clinics WHERE id = ?', [id]);
    res.json({ status: 0, success: true, data: updated[0], message: "Update Successfuly" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api/clinics/:id ────────────────────────────────────────────────────
// super_admin only — soft delete
async function deleteClinic(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT * FROM clinics WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Clinic not found' });

    await db.query(
      'UPDATE clinics SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
      [req.user.id, id]
    );
    res.json({ message: 'Clinic soft-deleted successfully', id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getClinics, getClinicById, createClinic, updateClinic, deleteClinic };