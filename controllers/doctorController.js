// controllers/doctorController.js
const db = require('../db');

// ── Shared: availability sub-query fragment ────────────────────────────────────
const availSubQuery = `
  (SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
      'id',    da.id,
      'day',   da.day_of_week,
      'start', TIME_FORMAT(da.start_time, '%H:%i'),
      'end',   TIME_FORMAT(da.end_time,   '%H:%i')
    )
  ) FROM doctor_availability da
  WHERE da.doctor_id = d.id AND da.deleted_at IS NULL) AS availability
`;

// ── GET /api/doctors ───────────────────────────────────────────────────────────
async function getDoctors(req, res) {
  try {
    let sql = `
      SELECT d.*, c.name AS clinic_name, ${availSubQuery}
      FROM doctors d
      JOIN clinics c ON d.clinic_id = c.id
      WHERE d.deleted_at IS NULL AND c.deleted_at IS NULL`;
    const params = [];

    if (req.scopedClinicId) {
      sql += ' AND d.clinic_id = ?';
      params.push(req.scopedClinicId);
    }
    sql += ' ORDER BY d.id ASC';

    const [rows] = await db.query(sql, params);
    res.json({ status: 0, success: true, data: rows, message: "Successfuly" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/doctors/lookup ────────────────────────────────────────────────────
// Query params:
//   name           → LIKE search on doctor name
//   specialization → LIKE search on specialization
//   clinic_id      → filter clinic (super_admin only; others auto-scoped)
//   dropdown=true  → minimal fields (id, name, specialization, clinic info) for <select>
async function lookupDoctors(req, res) {
  try {
    const { name, specialization, dropdown } = req.query;
    const params = [];

    const selectFields = (dropdown === 'true')
      ? 'd.id, d.name, d.specialization, d.available_days, d.clinic_id, c.name AS clinic_name'
      : `d.*, c.name AS clinic_name, ${availSubQuery}`;

    let sql = `
      SELECT ${selectFields}
      FROM doctors d
      JOIN clinics c ON d.clinic_id = c.id
      WHERE d.deleted_at IS NULL AND c.deleted_at IS NULL`;

    if (req.scopedClinicId) {
      sql += ' AND d.clinic_id = ?';
      params.push(req.scopedClinicId);
    }
    if (name) {
      sql += ' AND d.name LIKE ?';
      params.push(`%${name}%`);
    }
    if (specialization) {
      sql += ' AND d.specialization LIKE ?';
      params.push(`%${specialization}%`);
    }
    sql += ' ORDER BY d.name ASC';

    const [rows] = await db.query(sql, params);
    res.json({ status: 0, success: true, data: rows, message: "Successfuly" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/doctors/:id ───────────────────────────────────────────────────────
async function getDoctorById(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT d.*, c.name AS clinic_name, ${availSubQuery}
      FROM doctors d
      JOIN clinics c ON d.clinic_id = c.id
      WHERE d.id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });

    // Scope enforcement
    if (req.scopedClinicId && rows[0].clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied: doctor belongs to a different clinic' });
    }
    res.json({ status: 0, success: true, data: rows[0], message: "Successfuly" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/doctors ──────────────────────────────────────────────────────────
// Body: { clinic_id?, name, phone, email, specialization, qualification, bio,
//          available_days, availability: [{day_of_week, start_time, end_time}] }
// clinic_id: required for super_admin; auto-set from token for others
async function createDoctor(req, res) {
  const { name, phone, email, specialization, qualification, bio, available_days, availability } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const effectiveClinicId = (req.user.role === 'super_admin')
    ? req.body.clinic_id
    : req.user.clinic_id;

  if (!effectiveClinicId) {
    return res.status(400).json({ error: 'clinic_id is required (super_admin must supply it in body)' });
  }

  try {
    // Validate clinic
    const [clinics] = await db.query(
      'SELECT id FROM clinics WHERE id = ? AND deleted_at IS NULL', [effectiveClinicId]
    );
    if (clinics.length === 0) return res.status(404).json({ error: 'Clinic not found' });

    // Insert doctor
    const [result] = await db.query(`
      INSERT INTO doctors
        (clinic_id, name, phone, email, specialization, qualification, bio, available_days, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      effectiveClinicId, name,
      phone || null, email || null,
      specialization || null, qualification || null,
      bio || null, available_days || null,
      req.user.id
    ]);

    const doctorId = result.insertId;

    // Insert availability records if provided
    if (Array.isArray(availability) && availability.length > 0) {
      const avRows = availability.map(a => [doctorId, a.day_of_week, a.start_time, a.end_time, req.user.id]);
      await db.query(
        'INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, created_by) VALUES ?',
        [avRows]
      );
    }

    const [doctor] = await db.query(`
      SELECT d.*, c.name AS clinic_name, ${availSubQuery}
      FROM doctors d JOIN clinics c ON d.clinic_id = c.id WHERE d.id = ?
    `, [doctorId]);

    return res.status(201).json(doctor[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── PATCH /api/doctors/:id ─────────────────────────────────────────────────────
// Partial update. If `availability` array is provided, existing records are
// soft-deleted and the new set is inserted (full replacement of schedule).
async function updateDoctor(req, res) {
  const { id } = req.params;
  const { name, phone, email, specialization, qualification, bio, available_days, availability } = req.body;

  try {
    const [rows] = await db.query(
      'SELECT * FROM doctors WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });

    if (req.scopedClinicId && rows[0].clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied: doctor belongs to a different clinic' });
    }

    const d = rows[0];
    await db.query(`
      UPDATE doctors
      SET name=?, phone=?, email=?, specialization=?, qualification=?,
          bio=?, available_days=?, updated_by=?
      WHERE id=?
    `, [
      name ?? d.name,
      phone ?? d.phone,
      email ?? d.email,
      specialization ?? d.specialization,
      qualification ?? d.qualification,
      bio ?? d.bio,
      available_days ?? d.available_days,
      req.user.id,
      id
    ]);

    // Replace availability if provided
    if (Array.isArray(availability)) {
      // Soft-delete existing
      await db.query(
        'UPDATE doctor_availability SET deleted_at = NOW(), deleted_by = ? WHERE doctor_id = ? AND deleted_at IS NULL',
        [req.user.id, id]
      );
      // Insert new records
      if (availability.length > 0) {
        const avRows = availability.map(a => [id, a.day_of_week, a.start_time, a.end_time, req.user.id]);
        await db.query(
          'INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, created_by) VALUES ?',
          [avRows]
        );
      }
    }

    const [updated] = await db.query(`
      SELECT d.*, c.name AS clinic_name, ${availSubQuery}
      FROM doctors d JOIN clinics c ON d.clinic_id = c.id WHERE d.id = ?
    `, [id]);

    res.json({ status: 0, success: true, data: updated[0], message: "Update Successfuly" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api/doctors/:id ────────────────────────────────────────────────────
// Soft delete
async function deleteDoctor(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT * FROM doctors WHERE id = ? AND deleted_at IS NULL', [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Doctor not found' });

    if (req.scopedClinicId && rows[0].clinic_id !== req.scopedClinicId) {
      return res.status(403).json({ error: 'Access denied: doctor belongs to a different clinic' });
    }

    await db.query(
      'UPDATE doctors SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
      [req.user.id, id]
    );
    res.json({ message: 'Doctor soft-deleted successfully', id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getDoctors, lookupDoctors, getDoctorById, createDoctor, updateDoctor, deleteDoctor };