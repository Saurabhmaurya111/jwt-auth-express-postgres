const { pool } = require('../config/db');

const UserModel = {
  async create({ firstName, lastName, email, passwordHash }) {
    const { rows } = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, email, created_at`,
      [firstName, lastName, email.toLowerCase(), passwordHash]
    );
    return rows[0];
  },

  async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, password_hash, is_active
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, is_active, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },
};

module.exports = UserModel;
