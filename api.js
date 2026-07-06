const express = require('express');
const { supabase } = require('./supabase');

function createApiServer() {
  const app = express();
  app.use(express.json());

  // Shared-secret auth middleware. The Electron app sends this header;
  // it never talks to Supabase directly.
  app.use((req, res, next) => {
    const key = req.header('x-api-key');
    if (!key || key !== process.env.VALIDATION_API_KEY) {
      return res.status(401).json({ valid: false, reason: 'unauthorized' });
    }
    next();
  });

  app.post('/api/validate', async (req, res) => {
    try {
      const { key, hwid } = req.body || {};
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ valid: false, reason: 'missing_key' });
      }

      const { data: record, error } = await supabase
        .from('license_keys')
        .select('*')
        .eq('key_code', key.trim().toUpperCase())
        .maybeSingle();

      if (error) {
        console.error('[api] validate lookup error:', error);
        return res.status(500).json({ valid: false, reason: 'server_error' });
      }

      if (!record) {
        return res.json({ valid: false, reason: 'not_found' });
      }

      if (record.status === 'revoked') {
        return res.json({ valid: false, reason: 'revoked' });
      }

      if (record.status === 'unused') {
        return res.json({ valid: false, reason: 'not_activated' });
      }

      if (record.status === 'expired') {
        return res.json({ valid: false, reason: 'expired', expiresAt: record.expires_at });
      }

      // status === 'active' beyond this point
      if (record.expires_at && new Date(record.expires_at) < new Date()) {
        // Lazily flip to expired; the background job will also catch this.
        await supabase
          .from('license_keys')
          .update({ status: 'expired' })
          .eq('id', record.id);
        return res.json({ valid: false, reason: 'expired', expiresAt: record.expires_at });
      }

      // Basic anti-sharing: bind HWID on first validation, reject mismatches after.
      if (hwid) {
        if (!record.hwid) {
          await supabase
            .from('license_keys')
            .update({ hwid })
            .eq('id', record.id);
        } else if (record.hwid !== hwid) {
          return res.json({ valid: false, reason: 'hwid_mismatch' });
        }
      }

      return res.json({ valid: true, tier: record.tier, expiresAt: record.expires_at });
    } catch (err) {
      console.error('[api] unexpected error:', err);
      return res.status(500).json({ valid: false, reason: 'server_error' });
    }
  });

  return app;
}

module.exports = { createApiServer };
