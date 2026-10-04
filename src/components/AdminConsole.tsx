import { useEffect, useState, type FormEvent } from 'react';
import { GOALS } from '../data';
import { api, type AdminData } from '../lib/api';

const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString('en-NG')}`;
const number = (value: number) => Number(value).toLocaleString('en-NG');
const WRAP_TARGET = 30;

function WrapChart({ weeks }: { weeks: AdminData['wrap'] }) {
  const width = 560;
  const height = 180;
  const pad = { top: 16, right: 12, bottom: 30, left: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(60, ...weeks.map((week) => week.wrap ?? 0));
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;
  const slot = innerW / Math.max(weeks.length, 1);
  const bar = Math.min(38, slot * 0.6);

  return (
    <svg className="wrap-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="WRAP by week against the 30% target">
      {[0, 30, max].map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className={tick === WRAP_TARGET ? 'wrap-target' : 'wrap-grid'} />
          <text x={pad.left - 6} y={y(tick) + 3} textAnchor="end" className="wrap-axis">{Math.round(tick)}%</text>
        </g>
      ))}
      {weeks.map((week, index) => {
        const x = pad.left + slot * index + (slot - bar) / 2;
        const value = week.wrap;
        const current = index === weeks.length - 1;
        return (
          <g key={week.week_start}>
            {value !== null && (
              <rect x={x} y={y(value)} width={bar} height={Math.max(1, y(0) - y(value))} rx={3}
                className={value >= WRAP_TARGET ? 'wrap-bar ok' : 'wrap-bar'} opacity={current ? 0.55 : 1}>
                <title>{`Week of ${week.week_start}: ${value}% (${week.retained_users} of ${week.previous_active})${current ? ', in progress' : ''}`}</title>
              </rect>
            )}
            <text x={x + bar / 2} y={height - 10} textAnchor="middle" className="wrap-axis">
              {new Date(week.week_start).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
            </text>
          </g>
        );
      })}
      <text x={width - pad.right} y={y(WRAP_TARGET) - 5} textAnchor="end" className="wrap-axis wrap-target-label">30% target</text>
    </svg>
  );
}

export function AdminConsole({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grant, setGrant] = useState({ email: '', plan: 'builder', days: '30', note: '' });
  const [granting, setGranting] = useState(false);

  async function load() {
    try {
      setData(await api.admin());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Admin data could not be loaded.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function submitGrant(event: FormEvent) {
    event.preventDefault();
    setGranting(true);
    try {
      const result = await api.adminGrant({ email: grant.email.trim(), plan: grant.plan, days: Number(grant.days), note: grant.note.trim() });
      notify(result.plan === 'free'
        ? `${result.email} is back on Free.`
        : `${result.email} now has ${result.plan} until ${new Date(result.expires_at ?? '').toLocaleDateString('en-NG')}.`);
      setGrant({ email: '', plan: 'builder', days: '30', note: '' });
      void load();
    } catch (grantError) {
      notify(grantError instanceof Error ? grantError.message : 'The plan could not be granted.');
    } finally {
      setGranting(false);
    }
  }

  if (error) return <div className="screen-stack"><section className="panel"><h3>Admin console</h3><p>{error}</p></section></div>;
  if (!data) return <div className="screen-stack"><section className="panel"><p>Loading admin data…</p></section></div>;

  const o = data.overview;
  const completed = data.wrap.slice(0, -1).filter((week) => week.wrap !== null);
  const lastWrap = completed.length ? completed[completed.length - 1].wrap : null;
  const paid = o.builder_active + o.operator_active;
  const standard = new Set(GOALS.map((goal) => goal.label));
  const goalTotal = o.goals_30d.reduce((sum, goal) => sum + goal.count, 0);
  const customTotal = o.goals_30d.filter((goal) => !standard.has(goal.goal)).reduce((sum, goal) => sum + goal.count, 0);

  return (
    <div className="screen-stack admin-screen">
      <section className="screen-heading">
        <div><span className="eyebrow">ADMIN CONSOLE</span><h1>Is Nurj working?</h1><p>WRAP is the gate: no new growth features while it sits below 30%.</p></div>
        <button className="button button-ghost button-small" onClick={() => void load()}>Refresh</button>
      </section>

      <section className="admin-metrics">
        <article className="panel"><span>WRAP, last full week</span><strong className={lastWrap !== null && lastWrap >= WRAP_TARGET ? 'good' : 'warn'}>{lastWrap === null ? '—' : `${lastWrap}%`}</strong><small>Target 30%</small></article>
        <article className="panel"><span>Users</span><strong>{number(o.users_total)}</strong><small>+{number(o.users_new_7d)} in 7 days</small></article>
        <article className="panel"><span>Paying now</span><strong>{number(paid)}</strong><small>{o.builder_active} Builder · {o.operator_active} Operator · goal 60</small></article>
        <article className="panel"><span>Free to paid</span><strong>{o.users_total ? `${((o.ever_paid / o.users_total) * 100).toFixed(1)}%` : '—'}</strong><small>Ever paid ÷ all users · goal 6%</small></article>
        <article className="panel"><span>Revenue, 30 days</span><strong>{naira(o.revenue_30d_kobo - o.refunds_30d_kobo)}</strong><small>After {naira(o.refunds_30d_kobo)} refunds · goal ₦600k{o.refunds_pending ? ` · ${o.refunds_pending} refund${o.refunds_pending === 1 ? '' : 's'} need manual action` : ''}</small></article>
        <article className="panel"><span>AI tokens</span><strong>{number(o.tokens_today)}</strong><small>today · {number(o.tokens_30d)} in 30 days</small></article>
      </section>

      {data.insights && (
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">BATCH 5 · SECTOR INSIGHTS</span><h3>Progress to the 30-report threshold</h3></div><span>Insights switch on by themselves</span></div>
          {data.insights.length ? (
            <table className="admin-table">
              <thead><tr><th>Sector</th><th>Reports (6 months)</th><th>Best goal</th><th>Live goals</th></tr></thead>
              <tbody>{data.insights.map((row) => (
                <tr key={row.category}><td>{row.category.replaceAll('_', ' ')}</td><td>{number(row.reports)}</td><td>{row.best_goal_reports ?? 0} / 30</td><td>{row.live_goals}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="admin-empty">No outcome reports yet. They come from "Did it work?" after a run.</p>}
        </section>
      )}

      {data.features && (
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">FEATURE USE</span><h3>Batches 2 to 4</h3></div>
            {data.features.payments_needing_refund > 0 && <span className="admin-alert">{data.features.payments_needing_refund} payment{data.features.payments_needing_refund === 1 ? '' : 's'} to refund in Paystack</span>}
          </div>
          <table className="admin-table"><tbody>
            <tr><td>Saved prompts</td><td>{number(data.features.saved_prompts)}</td></tr>
            <tr><td>Wins logged (self-reported)</td><td>{number(data.features.wins_logged)} · {naira(data.features.wins_total_kobo)}</td></tr>
            <tr><td>Businesses</td><td>{number(data.features.businesses)}</td></tr>
            <tr><td>Active extra-business slots</td><td>{number(data.features.active_addons)}</td></tr>
            <tr><td>Opted out of the Monday email</td><td>{number(data.features.digest_opted_out)}</td></tr>
          </tbody></table>
        </section>
      )}

      <section className="panel">
        <div className="panel-title"><div><span className="eyebrow">RETENTION</span><h3>WRAP by week</h3></div><span>Faded bar = this week, still in progress</span></div>
        <WrapChart weeks={data.wrap} />
      </section>

      <section className="admin-grid">
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">WHO SIGNS UP</span><h3>Business categories</h3></div></div>
          <table className="admin-table"><tbody>{o.categories.map((row) => <tr key={row.name}><td>{row.name.replaceAll('_', ' ')}</td><td>{number(row.count)}</td></tr>)}</tbody></table>
          <h3 className="admin-sub">Stages</h3>
          <table className="admin-table"><tbody>{o.stages.map((row) => <tr key={row.name}><td>{row.name}</td><td>{number(row.count)}</td></tr>)}</tbody></table>
        </article>
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">WHAT THEY ASK FOR</span><h3>Goals, last 30 days</h3></div><span>{goalTotal ? `${Math.round((customTotal / goalTotal) * 100)}% custom` : ''}</span></div>
          <table className="admin-table"><tbody>{o.goals_30d.slice(0, 15).map((row) => (
            <tr key={row.goal}><td>{row.goal}{!standard.has(row.goal) && <em> custom</em>}</td><td>{number(row.count)}</td></tr>
          ))}</tbody></table>
        </article>
      </section>

      <section className="admin-grid">
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">MARGIN WATCH</span><h3>Heaviest AI users, 30 days</h3></div></div>
          <table className="admin-table">
            <thead><tr><th>Email</th><th>Plan</th><th>Calls</th><th>Tokens</th></tr></thead>
            <tbody>{o.top_ai_users_30d.map((row) => <tr key={row.email}><td>{row.email}</td><td>{row.plan}</td><td>{number(row.calls)}</td><td>{number(row.tokens)}</td></tr>)}</tbody>
          </table>
        </article>
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">MANUAL ACCESS</span><h3>Grant a plan</h3></div></div>
          <form className="admin-grant" onSubmit={submitGrant}>
            <label><span>Account email</span><input className="field" type="email" required value={grant.email} onChange={(event) => setGrant({ ...grant, email: event.target.value })} /></label>
            <div className="admin-grant-row">
              <label><span>Plan</span><select className="field" value={grant.plan} onChange={(event) => setGrant({ ...grant, plan: event.target.value })}><option value="builder">Builder</option><option value="operator">Operator</option><option value="free">Free (remove access)</option></select></label>
              <label><span>Days</span><input className="field" type="number" min={0} max={366} value={grant.days} disabled={grant.plan === 'free'} onChange={(event) => setGrant({ ...grant, days: event.target.value })} /></label>
            </div>
            <label><span>Note (partner, reason)</span><input className="field" maxLength={200} value={grant.note} onChange={(event) => setGrant({ ...grant, note: event.target.value })} /></label>
            <button className="button button-primary button-small" disabled={granting || !grant.email.trim()}>{granting ? 'Granting…' : 'Grant'}</button>
          </form>
          {data.grants.length > 0 && (
            <table className="admin-table"><tbody>{data.grants.map((row) => (
              <tr key={`${row.target_email}-${row.created_at}`}><td>{row.target_email}</td><td>{row.plan}{row.plan !== 'free' ? ` · ${row.days}d` : ''}</td><td>{new Date(row.created_at).toLocaleDateString('en-NG')}</td></tr>
            ))}</tbody></table>
          )}
        </article>
      </section>
    </div>
  );
}
