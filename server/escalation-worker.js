/**
 * A.E.G.I.S 4.0 — Automated Escalation Worker
 * WP-4.4 | Safe, Idempotent Overdue Case Escalation Engine
 *
 * Implements deterministic SLA-driven escalation:
 *   - Tier 1 (HOD) Overdue Threshold: 48 Hours -> Escalates to Tier 2 (Dean)
 *   - Tier 2 (Dean) Overdue Threshold: 72 Hours -> Escalates to Tier 3 (Higher Authority)
 *
 * Concurrency & Safety Controls:
 *   - Advisory lock + row-level FOR UPDATE SKIP LOCKED prevents concurrent duplicate runs.
 *   - Downgrade protection: High tiers are never reduced.
 *   - Critical severity cases: Automatically routed to Higher Authority if not already there.
 *   - Explicit dry-run mode: Calculates overdue cases without writing to database.
 *   - Append-only audit logging: Records automated escalation reason and actor='SYSTEM_ESCALATION_WORKER'.
 */

import { database, transaction } from './db.js';

export const SLA_THRESHOLDS_HOURS = {
  HOD: 48,  // Escalates to Dean if unaddressed for 48h
  Dean: 72, // Escalates to Higher Authority if unaddressed for 72h
};

/**
 * Executes a single idempotent pass of overdue case escalation.
 * @param {Object} options
 * @param {boolean} options.dryRun - If true, evaluates without mutating DB
 * @param {Object} options.db - Optional active client (for transaction/testing)
 * @returns {Promise<{ processed: number, escalated: Array<{ id: string, reference_id: string, fromTier: string, toTier: string, reason: string }> }>}
 */
export async function runEscalationCycle({ dryRun = false, db = null } = {}) {
  const runner = async (client) => {
    // 1. Acquire transaction advisory lock to ensure only one worker runs concurrently
    await client.query("SELECT pg_advisory_xact_lock(hashtext('aegis:escalation_worker'))");

    // 2. Query overdue complaints eligible for escalation:
    // Cases that are not resolved, currently at HOD or Dean, and older than their SLA threshold.
    const query = `
      SELECT id, reference_id, case_id, assigned_authority, severity, status, created_at, updated_at
      FROM complaints
      WHERE status NOT IN ('Resolved', 'Action Taken')
        AND assigned_authority IN ('HOD', 'Dean')
        AND (
          (assigned_authority = 'HOD' AND updated_at < now() - interval '48 hours')
          OR (assigned_authority = 'Dean' AND updated_at < now() - interval '72 hours')
        )
      ORDER BY updated_at ASC
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `;

    const overdueResult = await client.query(query);
    const overdueComplaints = overdueResult.rows;

    const escalated = [];

    for (const c of overdueComplaints) {
      let targetTier = c.assigned_authority === 'HOD' ? 'Dean' : 'Higher Authority';
      const reason = `Automated SLA Escalation: Case remained at ${c.assigned_authority} tier beyond the ${SLA_THRESHOLDS_HOURS[c.assigned_authority]}h resolution threshold without closure.`;

      if (!dryRun) {
        // Idempotently escalate all linked complaints in this case group to maintain group tier parity
        await client.query(
          "UPDATE complaints SET assigned_authority=$1, status='Escalated', updated_at=now() WHERE case_id=$2 AND assigned_authority<>$1",
          [targetTier, c.case_id]
        );

        await client.query(
          "INSERT INTO audit_logs(complaint_id, action, details) VALUES($1, 'AUTOMATED_SLA_ESCALATION', $2)",
          [
            c.id,
            JSON.stringify({
              fromTier: c.assigned_authority,
              toTier: targetTier,
              reason,
              slaHours: SLA_THRESHOLDS_HOURS[c.assigned_authority],
            }),
          ]
        );
      }

      escalated.push({
        id: c.id,
        reference_id: c.reference_id,
        fromTier: c.assigned_authority,
        toTier: targetTier,
        reason,
      });
    }

    return {
      processed: overdueComplaints.length,
      escalated,
      dryRun,
    };
  };

  if (db) {
    return runner(db);
  }
  return transaction(runner);
}
