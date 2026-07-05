const { pool } = require('../config/db');

const RefreshTokenModel = {
  async store({ userId, tokenHash, expiresAt }) {
    const { rows } = await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, tokenHash, expiresAt]
    );
    return rows[0].id;
  },

  async findValidByHash(tokenHash) {
    const { rows } = await pool.query(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = $1 AND revoked = false AND expires_at > now()`,
      [tokenHash]
    );
    return rows[0] || null;
  },

  async revokeById(id, replacedById = null) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked = true, replaced_by = $2 WHERE id = $1`,
      [id, replacedById]
    );
  },

  async revokeAllForUser(userId) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
      [userId]
    );
  },
};

module.exports = RefreshTokenModel;
