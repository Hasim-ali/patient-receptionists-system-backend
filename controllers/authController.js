// controllers/authController.js
const db      = require('../db');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

// ── POST /api/auth/login ───────────────────────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL',
      [email.toLowerCase().trim()]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user  = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role, clinic_id: user.clinic_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.status(200).json({
      token,
      user: {
        id:        user.id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        clinic_id: user.clinic_id
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/auth/create-user ─────────────────────────────────────────────────
// super_admin  → can create any role for any clinic
// clinic_admin → can only create 'receptionist' for their own clinic
// receptionist → forbidden
async function createUser(req, res) {
  const { name, email, password, role, clinic_id } = req.body;
  const actor = req.user;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, and role are required' });
  }

  const validRoles = ['super_admin', 'clinic_admin', 'receptionist'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  // ── Permission matrix ──────────────────────────────────────────────────────
  if (actor.role === 'clinic_admin') {
    if (role !== 'receptionist') {
      return res.status(403).json({ error: 'clinic_admin can only create receptionist users' });
    }
    const targetClinic = parseInt(clinic_id);
    if (targetClinic !== actor.clinic_id) {
      return res.status(403).json({ error: 'clinic_admin can only create users for their own clinic' });
    }
  }

  // clinic_id validation
  const effectiveClinicId = role === 'super_admin' ? null : clinic_id;
  if (role !== 'super_admin') {
    if (!effectiveClinicId) {
      return res.status(400).json({ error: 'clinic_id is required for clinic_admin and receptionist' });
    }
    const [clinics] = await db.query(
      'SELECT id FROM clinics WHERE id = ? AND deleted_at IS NULL',
      [effectiveClinicId]
    );
    if (clinics.length === 0) {
      return res.status(404).json({ error: 'Clinic not found' });
    }
  }

  try {
    // Email uniqueness check (soft-delete-safe)
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL',
      [email.toLowerCase().trim()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      `INSERT INTO users (name, email, password_hash, role, clinic_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email.toLowerCase().trim(), password_hash, role, effectiveClinicId, actor.id]
    );

    const [newUser] = await db.query(
      'SELECT id, name, email, role, clinic_id, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json({ user: newUser[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
async function getMe(req, res) {
  try {
    const [users] = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.clinic_id, u.created_at,
              c.name AS clinic_name, c.plan AS clinic_plan
       FROM users u
       LEFT JOIN clinics c ON u.clinic_id = c.id AND c.deleted_at IS NULL
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [req.user.id]
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(users[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { login, createUser, getMe };