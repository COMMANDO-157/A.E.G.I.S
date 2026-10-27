/** Synthetic-only rehearsal. No persistence, network, identities, clinical notes or grievance joins. */
export type ServiceKind = 'academic' | 'accessibility' | 'financial';
export type RequestState = 'requested' | 'acknowledged' | 'completed' | 'cancelled';
export type DemoActor = 'student' | 'other-student' | 'service-officer' | 'support-worker' | 'owner';
export type DemoRequest = { id: string; kind: ServiceKind; state: RequestState; version: number };
export type DemoSupport = { id: string; state: 'requested' | 'acknowledged' | 'withdrawn'; consent: boolean; version: number };
function deny(): never { throw new Error('This action is unavailable in this rehearsal.'); }

export function createStudentServicesRehearsal() {
  // Each invocation creates a fresh, disconnected synthetic session. Never accept real IDs or text.
  const requests = new Map<string, DemoRequest>();
  let support: DemoSupport | undefined;
  let sequence = 0;
  const events: { domain: 'services' | 'support'; action: string }[] = [];
  const student = (actor: DemoActor) => { if (actor !== 'student') deny(); };
  return {
    request(actor: DemoActor, kind: ServiceKind) {
      student(actor);
      if (!['academic', 'accessibility', 'financial'].includes(kind)) deny();
      if ([...requests.values()].some(r => r.kind === kind && ['requested', 'acknowledged'].includes(r.state))) deny();
      const record: DemoRequest = { id: `DEMO-SERVICE-${++sequence}`, kind, state: 'requested', version: 1 };
      requests.set(record.id, record);
      events.push({ domain: 'services', action: 'requested' });
      return { ...record };
    },
    list(actor: DemoActor) {
      if (!['student', 'service-officer'].includes(actor)) deny();
      return [...requests.values()].map(r => ({ ...r }));
    },
    transition(actor: DemoActor, id: string, expectedVersion: number, next: RequestState) {
      const r = requests.get(id);
      if (!r || r.version !== expectedVersion) deny();
      const cancellation = actor === 'student' && next === 'cancelled' && ['requested', 'acknowledged'].includes(r.state);
      const processing = actor === 'service-officer' && ((r.state === 'requested' && next === 'acknowledged') || (r.state === 'acknowledged' && next === 'completed'));
      if (!cancellation && !processing) deny();
      const updated = { ...r, state: next, version: r.version + 1 };
      requests.set(id, updated);
      events.push({ domain: 'services', action: next });
      return { ...updated };
    },
    requestSupport(actor: DemoActor, consent: boolean) {
      student(actor);
      if (consent !== true || (support && support.state !== 'withdrawn')) deny();
      support = { id: 'DEMO-SUPPORT', state: 'requested', consent: true, version: (support?.version ?? 0) + 1 };
      events.push({ domain: 'support', action: 'requested' });
      return { ...support };
    },
    readSupport(actor: DemoActor) {
      if (actor !== 'student' && !(actor === 'support-worker' && support?.consent)) deny();
      return support ? { ...support } : null;
    },
    acknowledgeSupport(actor: DemoActor, expectedVersion: number) {
      if (actor !== 'support-worker' || !support?.consent || support.state !== 'requested' || support.version !== expectedVersion) deny();
      support = { ...support, state: 'acknowledged', version: support.version + 1 };
      events.push({ domain: 'support', action: 'acknowledged' });
      return { ...support };
    },
    withdrawSupport(actor: DemoActor) {
      student(actor);
      if (!support?.consent) deny();
      support = { ...support, state: 'withdrawn', consent: false, version: support.version + 1 };
      events.push({ domain: 'support', action: 'withdrawn' });
      return { ...support };
    },
    // Institutional disclosure/retention/urgent-risk rules remain unresolved: no override exists.
    discloseSupport: deny,
    exportSupport: deny,
    deleteRecords: deny,
    audit() { return events.map(e => ({ ...e })); },
  };
}
