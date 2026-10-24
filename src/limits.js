// Spending caps for the public demo. Every live render spends real YouCam units
// from one account, so three limits apply, all configurable by env:
//
//   RENDERS_PER_VISITOR   renders one visitor may start per UTC day   (3)
//   DAILY_UNIT_CAP        units the whole demo may spend per UTC day  (150)
//   MAX_CONCURRENT        renders running at the same time            (2)
//
// A render reserves its full planned cost before it starts; when it ends, the
// reservation is replaced by the units actually counted. The daily unit cap is
// the hard limit. The per-visitor limit is keyed by IP address and is a
// courtesy, not a security boundary.

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

export function createLimits({
  perVisitor = 3,
  dailyUnits = 150,
  maxConcurrent = 2,
  now = Date.now,
} = {}) {
  let day = dayKey(now());
  let units = 0;
  let renders = 0;
  let running = 0;
  const visitors = new Map();

  function roll() {
    const d = dayKey(now());
    if (d !== day) {
      day = d;
      units = 0;
      renders = 0;
      visitors.clear();
    }
  }

  function check(visitor, cost) {
    roll();
    if ((visitors.get(visitor) || 0) >= perVisitor)
      return { ok: false, reason: `This demo allows ${perVisitor} live renders per visitor per day. The example cards still work.` };
    if (units + cost > dailyUnits)
      return { ok: false, reason: "Today's YouCam unit budget for the demo is used up. It resets at 00:00 UTC; the example cards still work." };
    if (running >= maxConcurrent) return { ok: false, reason: "Two renders are already running. Try again in a minute." };
    return { ok: true };
  }

  function reserve(visitor, cost) {
    const verdict = check(visitor, cost);
    if (!verdict.ok) return verdict;
    visitors.set(visitor, (visitors.get(visitor) || 0) + 1);
    units += cost;
    renders += 1;
    running += 1;
    const ticket = { day, reserved: cost, open: true };
    return { ok: true, ticket };
  }

  function settle(ticket, actual) {
    if (!ticket?.open) return;
    ticket.open = false;
    running = Math.max(0, running - 1);
    if (ticket.day === day) units = Math.max(0, units - ticket.reserved + actual);
  }

  function snapshot(visitor) {
    roll();
    return {
      day,
      unitsUsedToday: units,
      dailyUnitCap: dailyUnits,
      rendersToday: renders,
      perVisitor,
      visitorRendersLeft: Math.max(0, perVisitor - (visitors.get(visitor) || 0)),
      running,
      maxConcurrent,
    };
  }

  return { check, reserve, settle, snapshot };
}

export function limitsFromEnv(env = process.env) {
  const n = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
  return {
    perVisitor: n(env.RENDERS_PER_VISITOR, 3),
    dailyUnits: n(env.DAILY_UNIT_CAP, 150),
    maxConcurrent: n(env.MAX_CONCURRENT, 2),
  };
}
