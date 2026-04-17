// swagger.js — OpenAPI 3.0 specification config
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'Patient Receptionist System API',
      version:     '2.0.0',
      description: [
        'Multi-clinic appointment management system.',
        '**Roles:** `super_admin` (global) | `clinic_admin` (per-clinic) | `receptionist` (per-clinic, appointments only)',
        '**Plans:** `free` (no WhatsApp) | `basic` (confirmation only) | `premium` (full WhatsApp suite)',
        '',
        'All protected routes require `Authorization: Bearer <token>` header.',
        'Obtain a token via `POST /api/auth/login`.'
      ].join('\n')
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local Development' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type:         'http',
          scheme:       'bearer',
          bearerFormat: 'JWT',
          description:  'JWT token obtained from POST /api/auth/login'
        }
      },
      schemas: {
        // ── Clinic ──────────────────────────────────────────
        Clinic: {
          type: 'object',
          properties: {
            id:         { type: 'integer', example: 1 },
            name:       { type: 'string',  example: 'City Health Clinic' },
            address:    { type: 'string',  example: '123 MG Road, Mumbai' },
            phone:      { type: 'string',  example: '+912212345678' },
            email:      { type: 'string',  example: 'clinic@example.com' },
            plan:       { type: 'string',  enum: ['free','basic','premium'] },
            created_at: { type: 'string',  format: 'date-time' },
            created_by: { type: 'integer', nullable: true },
            updated_at: { type: 'string',  format: 'date-time' },
            updated_by: { type: 'integer', nullable: true },
            deleted_at: { type: 'string',  format: 'date-time', nullable: true },
            deleted_by: { type: 'integer', nullable: true }
          }
        },
        ClinicInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name:    { type: 'string', example: 'City Health Clinic' },
            address: { type: 'string', example: '123 MG Road, Mumbai' },
            phone:   { type: 'string', example: '+912212345678' },
            email:   { type: 'string', example: 'clinic@example.com' },
            plan:    { type: 'string', enum: ['free','basic','premium'], default: 'free' }
          }
        },
        // ── Doctor ──────────────────────────────────────────
        DoctorAvailabilitySlot: {
          type: 'object',
          required: ['day_of_week','start_time','end_time'],
          properties: {
            day_of_week: { type: 'string', enum: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
            start_time:  { type: 'string', example: '09:00' },
            end_time:    { type: 'string', example: '17:00' }
          }
        },
        Doctor: {
          type: 'object',
          properties: {
            id:             { type: 'integer', example: 1 },
            clinic_id:      { type: 'integer', example: 1 },
            clinic_name:    { type: 'string',  example: 'City Health Clinic' },
            name:           { type: 'string',  example: 'Dr. Rajesh Sharma' },
            phone:          { type: 'string',  example: '+919876543210' },
            email:          { type: 'string',  example: 'dr.sharma@clinic.com' },
            specialization: { type: 'string',  example: 'Cardiologist' },
            qualification:  { type: 'string',  example: 'MBBS, MD' },
            bio:            { type: 'string',  example: 'Senior cardiologist with 15 years experience.' },
            available_days: { type: 'string',  example: 'Mon,Tue,Wed,Thu,Fri' },
            availability:   {
              type: 'array',
              items: { '$ref': '#/components/schemas/DoctorAvailabilitySlot' }
            }
          }
        },
        DoctorInput: {
          type: 'object',
          required: ['name'],
          properties: {
            clinic_id:      { type: 'integer', description: 'Required for super_admin; others auto-scoped.' },
            name:           { type: 'string' },
            phone:          { type: 'string' },
            email:          { type: 'string' },
            specialization: { type: 'string' },
            qualification:  { type: 'string' },
            bio:            { type: 'string' },
            available_days: { type: 'string', example: 'Mon,Tue,Wed,Thu,Fri' },
            availability: {
              type: 'array',
              items: { '$ref': '#/components/schemas/DoctorAvailabilitySlot' }
            }
          }
        },
        // ── Patient ─────────────────────────────────────────
        Patient: {
          type: 'object',
          properties: {
            id:           { type: 'integer' },
            clinic_id:    { type: 'integer' },
            clinic_name:  { type: 'string' },
            name:         { type: 'string' },
            phone:        { type: 'string' },
            subscription: { type: 'string', enum: ['basic','premium'] }
          }
        },
        PatientInput: {
          type: 'object',
          required: ['name','phone','subscription'],
          properties: {
            clinic_id:    { type: 'integer', description: 'Required for super_admin.' },
            name:         { type: 'string',  example: 'Ramesh Verma' },
            phone:        { type: 'string',  example: '+919000000001' },
            subscription: { type: 'string',  enum: ['basic','premium'] }
          }
        },
        // ── Appointment ─────────────────────────────────────
        Appointment: {
          type: 'object',
          properties: {
            id:               { type: 'integer' },
            clinic_id:        { type: 'integer' },
            clinic_name:      { type: 'string' },
            doctor_id:        { type: 'integer' },
            doctor_name:      { type: 'string' },
            patient_id:       { type: 'integer' },
            patient_name:     { type: 'string' },
            patient_phone:    { type: 'string' },
            subscription:     { type: 'string' },
            appointment_date: { type: 'string', format: 'date' },
            appointment_time: { type: 'string', example: '09:00:00' },
            status:           { type: 'string', enum: ['booked','visited','skipped'] }
          }
        },
        // ── Auth ────────────────────────────────────────────
        LoginInput: {
          type: 'object',
          required: ['email','password'],
          properties: {
            email:    { type: 'string', example: 'superadmin@system.com' },
            password: { type: 'string', example: 'SuperAdmin@123' }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id:        { type: 'integer' },
                name:      { type: 'string' },
                email:     { type: 'string' },
                role:      { type: 'string' },
                clinic_id: { type: 'integer', nullable: true }
              }
            }
          }
        },
        CreateUserInput: {
          type: 'object',
          required: ['name','email','password','role'],
          properties: {
            name:      { type: 'string' },
            email:     { type: 'string' },
            password:  { type: 'string', example: 'StrongPass@123' },
            role:      { type: 'string', enum: ['super_admin','clinic_admin','receptionist'] },
            clinic_id: { type: 'integer', description: 'Required for clinic_admin and receptionist.' }
          }
        },
        // ── Generic ─────────────────────────────────────────
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } }
        },
        SuccessMessage: {
          type: 'object',
          properties: { message: { type: 'string' } }
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./routes/index.js']  // All @swagger annotations are in routes/index.js
};

module.exports = swaggerJsdoc(options);