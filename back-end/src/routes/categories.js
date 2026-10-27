const express = require('express');
const { query } = require('../db');
const { DEFAULT_USER_ID } = require('../config');

const router = express.Router();

// a six-digit hex colour, e.g. "#3b82f6"
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM categories WHERE user_id IS NULL OR user_id = $1 ORDER BY name',
      [DEFAULT_USER_ID]
    );
    res.json({ categories: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories', details: err.message });
  }
});

router.post('/', express.json(), async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name is required' });

  const color = req.body.color ?? null;
  if (color !== null && (typeof color !== 'string' || !COLOR_PATTERN.test(color))) {
    return res.status(400).json({ error: 'color must be a six-digit hex code like #3b82f6' });
  }

  try {
    const result = await query(
      'INSERT INTO categories (name, user_id, color) VALUES ($1, $2, $3) RETURNING *',
      [name, DEFAULT_USER_ID, color]
    );
    res.json({ category: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Category already exists' });
    }
    res.status(500).json({ error: 'Failed to create category', details: err.message });
  }
});

module.exports = router;
