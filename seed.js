// seed.js — Run ONCE after schema.sql to populate dummy data
// Usage: node seed.js
// Passwords: superadmin→SuperAdmin@123 | clinic_admin→ClinicAdmin@123 | receptionist→Recep@123

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

async function seed() {
  try {
    console.log('🌱 Starting seed...');

    // ── 1. Clinics ──────────────────────────────────────────────────────────
    await db.query(`
      INSERT INTO clinics (id, name, address, phone, email, plan) VALUES
      (1, 'City Health Clinic', '123 MG Road, Mumbai, Maharashtra', '+912212345678', 'cityhealthclinic@gmail.com', 'premium'),
      (2, 'Sunrise Medical',    '456 Park St, Pune, Maharashtra',   '+912098765432', 'sunrisemedical@gmail.com',   'basic'),
      (3, 'Demo Free Clinic',   '789 Lake Road, Nagpur',            '+917712345678', 'demofree@gmail.com',         'free')
    `);
    console.log('✅ Clinics inserted');

    // ── 2. Users ────────────────────────────────────────────────────────────
    const [superHash, adminHash, recepHash] = await Promise.all([
      bcrypt.hash('SuperAdmin@123',  10),
      bcrypt.hash('ClinicAdmin@123', 10),
      bcrypt.hash('Recep@123',       10)
    ]);

    await db.query(`
      INSERT INTO users (id, name, email, password_hash, role, clinic_id, created_by) VALUES
      (1, 'Super Admin',          'superadmin@system.com',       ?, 'super_admin',  NULL, NULL),
      (2, 'City Health Admin',    'admin@cityhealthclinic.com',  ?, 'clinic_admin',    1, 1),
      (3, 'Sunrise Admin',        'admin@sunrisemedical.com',    ?, 'clinic_admin',    2, 1),
      (4, 'Free Clinic Admin',    'admin@demofree.com',          ?, 'clinic_admin',    3, 1),
      (5, 'City Receptionist',    'recep@cityhealthclinic.com',  ?, 'receptionist',    1, 2),
      (6, 'Sunrise Receptionist', 'recep@sunrisemedical.com',    ?, 'receptionist',    2, 3)
    `, [superHash, adminHash, adminHash, adminHash, recepHash, recepHash]);
    console.log('✅ Users inserted');

    // ── 3. Doctors ──────────────────────────────────────────────────────────
    await db.query(`
      INSERT INTO doctors (id, clinic_id, name, phone, email, specialization, qualification, bio, available_days, created_by) VALUES
      (1, 1, 'Dr. Rajesh Sharma', '+919876543210', 'dr.sharma@cityhealthclinic.com',
         'Cardiologist', 'MBBS, MD (Cardiology)',
         'Senior cardiologist with 15 years of experience in interventional cardiology.',
         'Mon,Tue,Wed,Thu,Fri', 2),
      (2, 1, 'Dr. Priya Patel', '+919876543211', 'dr.patel@cityhealthclinic.com',
         'Dermatologist', 'MBBS, MD (Dermatology)',
         'Specialist in skin disorders and cosmetic dermatology.',
         'Mon,Wed,Fri', 2),
      (3, 2, 'Dr. Amit Gupta', '+919876543212', 'dr.gupta@sunrisemedical.com',
         'General Physician', 'MBBS',
         'General practitioner with 10 years of community health experience.',
         'Mon,Tue,Wed,Thu,Fri,Sat', 3),
      (4, 2, 'Dr. Sunita Rao', '+919876543213', 'dr.rao@sunrisemedical.com',
         'Pediatrician', 'MBBS, DCH',
         'Dedicated child health specialist focusing on newborn care.',
         'Tue,Thu,Sat', 3),
      (5, 3, 'Dr. Vijay Nair', '+919876543214', 'dr.nair@demofree.com',
         'General Physician', 'MBBS',
         'General physician at the free community clinic.',
         'Mon,Wed,Fri', 4)
    `);
    console.log('✅ Doctors inserted');

    // ── 4. Doctor Availability ───────────────────────────────────────────────
    await db.query(`
      INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, created_by) VALUES
      (1, 'Mon', '09:00:00', '17:00:00', 2),
      (1, 'Tue', '09:00:00', '17:00:00', 2),
      (1, 'Wed', '09:00:00', '17:00:00', 2),
      (1, 'Thu', '09:00:00', '17:00:00', 2),
      (1, 'Fri', '09:00:00', '13:00:00', 2),
      (2, 'Mon', '10:00:00', '16:00:00', 2),
      (2, 'Wed', '10:00:00', '16:00:00', 2),
      (2, 'Fri', '10:00:00', '14:00:00', 2),
      (3, 'Mon', '08:00:00', '18:00:00', 3),
      (3, 'Tue', '08:00:00', '18:00:00', 3),
      (3, 'Wed', '08:00:00', '18:00:00', 3),
      (3, 'Thu', '08:00:00', '18:00:00', 3),
      (3, 'Fri', '08:00:00', '18:00:00', 3),
      (3, 'Sat', '08:00:00', '13:00:00', 3),
      (4, 'Tue', '09:00:00', '15:00:00', 3),
      (4, 'Thu', '09:00:00', '15:00:00', 3),
      (4, 'Sat', '09:00:00', '12:00:00', 3),
      (5, 'Mon', '09:00:00', '16:00:00', 4),
      (5, 'Wed', '09:00:00', '16:00:00', 4),
      (5, 'Fri', '09:00:00', '16:00:00', 4)
    `);
    console.log('✅ Doctor availability inserted');

    // ── 5. Patients ──────────────────────────────────────────────────────────
    await db.query(`
      INSERT INTO patients (id, clinic_id, name, phone, subscription, created_by) VALUES
      (1, 1, 'Ramesh Verma',  '+919000000001', 'premium', 5),
      (2, 1, 'Sunita Mehta',  '+919000000002', 'basic',   5),
      (3, 1, 'Anil Kumar',    '+919000000003', 'premium', 5),
      (4, 2, 'Kavita Singh',  '+919000000004', 'basic',   6),
      (5, 2, 'Mohan Das',     '+919000000005', 'premium', 6),
      (6, 3, 'Geeta Sharma',  '+919000000006', 'basic',   4)
    `);
    console.log('✅ Patients inserted');

    // ── 6. Appointments ──────────────────────────────────────────────────────
    const today     = new Date().toISOString().split('T')[0];
    const tomorrow  = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    await db.query(`
      INSERT INTO appointments
        (clinic_id, doctor_id, patient_id, appointment_date, appointment_time, status, created_by)
      VALUES
        (1, 1, 1, ?, '09:00:00', 'booked',  5),
        (1, 1, 2, ?, '09:30:00', 'booked',  5),
        (1, 2, 3, ?, '10:00:00', 'visited', 5),
        (2, 3, 4, ?, '08:00:00', 'booked',  6),
        (2, 4, 5, ?, '09:00:00', 'skipped', 6)
    `, [today, today, yesterday, tomorrow, yesterday]);
    console.log('✅ Appointments inserted');

    console.log('\n🎉 Seed complete! Login credentials:');
    console.log('   super_admin  → superadmin@system.com      / SuperAdmin@123');
    console.log('   clinic_admin → admin@cityhealthclinic.com / ClinicAdmin@123');
    console.log('   receptionist → recep@cityhealthclinic.com / Recep@123');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();