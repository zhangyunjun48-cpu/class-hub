import type { Pool } from "pg";
import type { ServerEnvironment } from "../config/env.js";
import { normalizeName, normalizeStudentId, studentIdHmac, studentIdLast4 } from "../lib/crypto.js";

export async function ensureSystemOwner(pool: Pool, environment: ServerEnvironment) {
  if (!environment.FALLBACK_OWNER_ID || !environment.FALLBACK_OWNER_NAME || !environment.STUDENT_ID_HMAC_KEY) return null;
  const hmac = studentIdHmac(environment.FALLBACK_OWNER_ID, environment.STUDENT_ID_HMAC_KEY);
  const result = await pool.query(
    `INSERT INTO members (student_id_hmac, student_id_last4, name, name_normalized, group_name, role, is_system_owner, active)
     VALUES ($1,$2,$3,$4,'系统兜底','owner',true,true)
     ON CONFLICT (student_id_hmac) DO UPDATE
       SET name=EXCLUDED.name, name_normalized=EXCLUDED.name_normalized, role='owner', is_system_owner=true, active=true, updated_at=now()
     RETURNING id`,
    [hmac, studentIdLast4(environment.FALLBACK_OWNER_ID), environment.FALLBACK_OWNER_NAME, normalizeName(environment.FALLBACK_OWNER_NAME)],
  );
  return result.rows[0]?.id as string;
}

export const normalizeOwnerId = normalizeStudentId;
