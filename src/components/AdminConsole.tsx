import { useEffect, useState, type FormEvent } from 'react';
import { GOALS } from '../data';
import { api, type AdminData, type AdminFinancials, type AdminGrowth, type AdminTransfer, type AdminTransferReview } from '../lib/api';

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
        <div><span className="eyebrow">Admin console</span><h1>Is Nurj working?</h1><p>WRAP is the gate: no new growth features while it sits below 30%.</p></div>
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

      {(data.transfers || data.transfer_reviews) && (
        <TransfersPanel transfers={data.transfers ?? []} reviews={data.transfer_reviews ?? []} notify={notify} onChange={() => void load()} />
      )}

      {data.financials && <FinancialsPanel financials={data.financials} />}

      {data.growth && <GrowthPanel growth={data.growth} />}

      {data.insights && (
        <section className="panel">
          <div className="panel-title"><div><span className="eyebrow">Batch 5 · sector insights</span><h3>Progress to the 30-report threshold</h3></div><span>Insights switch on by themselves</span></div>
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
          <div className="panel-title"><div><span className="eyebrow">Feature use</span><h3>Batches 2 to 4</h3></div>
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
        <div className="panel-title"><div><span className="eyebrow">Retention</span><h3>WRAP by week</h3></div><span>Faded bar = this week, still in progress</span></div>
        <WrapChart weeks={data.wrap} />
      </section>

      <section className="admin-grid">
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">Who signs up</span><h3>Business categories</h3></div></div>
          <table className="admin-table"><tbody>{o.categories.map((row) => <tr key={row.name}><td>{row.name.replaceAll('_', ' ')}</td><td>{number(row.count)}</td></tr>)}</tbody></table>
          <h3 className="admin-sub">Stages</h3>
          <table className="admin-table"><tbody>{o.stages.map((row) => <tr key={row.name}><td>{row.name}</td><td>{number(row.count)}</td></tr>)}</tbody></table>
        </article>
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">What they ask for</span><h3>Goals, last 30 days</h3></div><span>{goalTotal ? `${Math.round((customTotal / goalTotal) * 100)}% custom` : ''}</span></div>
          <table className="admin-table"><tbody>{o.goals_30d.slice(0, 15).map((row) => (
            <tr key={row.goal}><td>{row.goal}{!standard.has(row.goal) && <em> custom</em>}</td><td>{number(row.count)}</td></tr>
          ))}</tbody></table>
        </article>
      </section>

      <section className="admin-grid">
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">Margin watch</span><h3>Heaviest AI users, 30 days</h3></div></div>
          <table className="admin-table">
            <thead><tr><th>Email</th><th>Plan</th><th>Calls</th><th>Tokens</th></tr></thead>
            <tbody>{o.top_ai_users_30d.map((row) => <tr key={row.email}><td>{row.email}</td><td>{row.plan}</td><td>{number(row.calls)}</td><td>{number(row.tokens)}</td></tr>)}</tbody>
          </table>
        </article>
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">Manual access</span><h3>Grant a plan</h3></div></div>
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

const pct = (value: number | null) => (value === null || value === undefined ? '—' : `${value}%`);

/** The conversion and retention engine, step by step, plus where users come from. */
function GrowthPanel({ growth }: { growth: AdminGrowth }) {
  const f = growth.funnel;
  const steps: Array<[string, string, string, boolean | null]> = [
    ['Sign-ups, 30 days', String(f.signups_30d), 'Comp accounts excluded', null],
    ['First prompt within 10 minutes', pct(f.first_prompt_10min_pct), 'Of 30-day sign-ups · goal 60%+', f.first_prompt_10min_pct === null ? null : f.first_prompt_10min_pct >= 60],
    ['Free users who tried the enhancer', pct(f.enhancer_tried_pct_free), 'Under 10%: add a "make it stronger" prompt', f.enhancer_tried_pct_free === null ? null : f.enhancer_tried_pct_free >= 10],
    ['Free users hitting the daily limit', String(f.free_users_hitting_limit_7d), 'Last 7 days · send each a 3-day Builder pass', null],
    ['Paid, of users 30+ days old', pct(f.paid_pct_of_mature), 'Goal 6% · under 3%: fix onboarding first', f.paid_pct_of_mature === null ? null : f.paid_pct_of_mature >= 6],
    ['Renewals, 30 days', `${f.renewals_30d} renewed · ${f.renewals_failed_30d} failed`, `${f.auto_renew_off} paying users have auto-renew off`, null],
  ];
  return (
    <section className="panel">
      <div className="panel-title"><div><span className="eyebrow">Conversion and retention engine</span><h3>Where users drop off</h3></div><span>Fix the weakest step first</span></div>
      <table className="admin-table"><tbody>
        {steps.map(([label, value, note, good]) => (
          <tr key={label}><td>{label}<br /><small>{note}</small></td><td><strong className={good === null ? undefined : good ? 'good' : 'warn'}>{value}</strong></td></tr>
        ))}
      </tbody></table>
      <section className="admin-grid">
        <div>
          <h3 className="admin-sub">By tracked link</h3>
          {growth.by_source.length ? <table className="admin-table"><tbody>{growth.by_source.map((row) => <tr key={row.source}><td>{row.source}</td><td>{row.signups} sign-ups · {row.paid} paid</td></tr>)}</tbody></table> : <p className="admin-empty">No sign-ups yet.</p>}
        </div>
        <div>
          <h3 className="admin-sub">Where did you hear about Nurj?</h3>
          {growth.heard_from.length ? <table className="admin-table"><tbody>{growth.heard_from.map((row) => <tr key={row.answer}><td>{row.answer}</td><td>{row.count}</td></tr>)}</tbody></table> : <p className="admin-empty">No answers yet.</p>}
        </div>
      </section>
    </section>
  );
}

const PLAN_NAMES: Record<string, string> = { builder: 'Builder', operator: 'Operator', business_addon: 'Extra business' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/** Bank transfers waiting for money, and inbox emails the agent could not settle alone. */
function TransfersPanel({ transfers, reviews, notify, onChange }: {
  transfers: AdminTransfer[];
  reviews: AdminTransferReview[];
  notify: (message: string) => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const byReference = new Map(transfers.map((row) => [row.reference, row]));

  async function act(key: string, body: Parameters<typeof api.adminTransfer>[0], confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try {
      const result = await api.adminTransfer(body);
      notify(result.needs_refund ? result.reason ?? 'Paid, but the plan could not be applied. Refund it.'
        : result.activated ? 'Confirmed. The plan is active and the customer has been emailed.'
        : result.rejected ? 'Transfer marked as not received.' : 'Dismissed.');
      onChange();
    } catch (actError) {
      notify(actError instanceof Error ? actError.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <div><span className="eyebrow">Bank transfers</span><h3>Payments to confirm</h3></div>
        <span>{reviews.length ? <span className="admin-alert">{reviews.length} email{reviews.length === 1 ? '' : 's'} need a look</span> : 'The inbox agent confirms matched bank alerts by itself'}</span>
      </div>

      {reviews.length > 0 && (
        <>
          <h3 className="admin-sub">Needs your decision</h3>
          <table className="admin-table">
            <thead><tr><th>Email</th><th>Why it stopped</th><th /></tr></thead>
            <tbody>{reviews.map((row) => {
              const match = row.payment_reference ? byReference.get(row.payment_reference) : undefined;
              return (
                <tr key={row.message_id}>
                  <td>
                    {row.kind === 'bank_alert' ? 'Bank alert' : 'Proof email'} · {when(row.received_at)}<br />
                    <small>{row.from_address ?? 'unknown'}{row.subject ? ` · ${row.subject}` : ''}</small>
                  </td>
                  <td>
                    {row.detail}
                    {row.amount_kobo ? <><br /><small>Amount seen: {naira(row.amount_kobo)}{row.token ? ` · NURJ-${row.token}` : ''}</small></> : null}
                    {match && <><br /><small>Matches {match.token} · {match.email ?? 'no email'} · {PLAN_NAMES[match.plan] ?? match.plan} {naira(match.amount_kobo)}</small></>}
                  </td>
                  <td className="admin-actions">
                    {match && (
                      <button className="button button-primary button-small" disabled={busy !== null}
                        onClick={() => void act(row.message_id, { action: 'confirm_transfer', reference: match.reference, message_id: row.message_id },
                          `Confirm ${naira(match.amount_kobo)} from ${match.email ?? 'this customer'} and switch on ${PLAN_NAMES[match.plan] ?? match.plan}? Check your bank app first.`)}>
                        Confirm
                      </button>
                    )}
                    <button className="button button-ghost button-small" disabled={busy !== null}
                      onClick={() => void act(row.message_id, { action: 'dismiss_message', message_id: row.message_id })}>Dismiss</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </>
      )}

      <h3 className="admin-sub">Open transfers</h3>
      {transfers.length ? (
        <table className="admin-table">
          <thead><tr><th>Customer</th><th>Token</th><th>Status</th><th /></tr></thead>
          <tbody>{transfers.map((row) => (
            <tr key={row.reference}>
              <td>{row.email ?? '—'}<br /><small>{PLAN_NAMES[row.plan] ?? row.plan} · {naira(row.amount_kobo)} · started {when(row.created_at)}</small></td>
              <td><strong>{row.token}</strong></td>
              <td>{row.proof_received_at ? `Receipt in ${when(row.proof_received_at)}` : 'Waiting'}{new Date(row.expires_at).getTime() < Date.now() ? <><br /><small>Token expired</small></> : null}</td>
              <td className="admin-actions">
                <button className="button button-secondary button-small" disabled={busy !== null}
                  onClick={() => void act(row.reference, { action: 'confirm_transfer', reference: row.reference },
                    `Only confirm if ${naira(row.amount_kobo)} with ${row.token} is in your bank account. Switch on ${PLAN_NAMES[row.plan] ?? row.plan} for ${row.email ?? 'this customer'}?`)}>
                  Confirm
                </button>
                <button className="button button-ghost button-small" disabled={busy !== null}
                  onClick={() => void act(row.reference, { action: 'reject_transfer', reference: row.reference }, `Mark ${row.token} as not received? The customer can start a new transfer.`)}>
                  Not received
                </button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="admin-empty">No open transfers.</p>}
    </section>
  );
}

/** Daily money and activity, Lagos days, newest first. */
function FinancialsPanel({ financials }: { financials: AdminFinancials }) {
  const days = financials.days;
  const rate = financials.ai_cost_ngn_per_million;
  const sum = (pick: (day: AdminFinancials['days'][number]) => number, list = days) => list.reduce((total, day) => total + Number(pick(day) || 0), 0);
  const gross = (day: AdminFinancials['days'][number]) => Number(day.card_kobo) + Number(day.transfer_kobo) - Number(day.refunds_kobo);
  const week = days.slice(0, 7);
  const revenue30 = sum(gross);
  const revenue7 = sum(gross, week);
  const aiCostKobo = (tokens: number) => (rate ? Math.round((tokens / 1_000_000) * rate * 100) : null);
  const ai30 = aiCostKobo(sum((day) => day.ai_tokens));
  const maxRevenue = Math.max(1, ...days.map(gross));
  const avgActive = week.length ? Math.round(sum((day) => day.active_users, week) / week.length) : 0;
  const chartDays = [...days].reverse();

  return (
    <section className="panel">
      <div className="panel-title"><div><span className="eyebrow">Financials</span><h3>Money and activity, by day</h3></div><span>Lagos time · comp accounts excluded from sign-ups</span></div>
      <section className="admin-metrics">
        <article className="panel"><span>Net revenue, 7 days</span><strong>{naira(revenue7)}</strong><small>{naira(revenue30)} in 30 days</small></article>
        <article className="panel"><span>Active plans, monthly value</span><strong>{naira(financials.run_rate_kobo)}</strong><small>What paying users are worth per 30 days</small></article>
        <article className="panel"><span>By transfer, 30 days</span><strong>{naira(sum((day) => day.transfer_kobo))}</strong><small>{naira(sum((day) => day.card_kobo))} by card</small></article>
        <article className="panel"><span>AI cost, 30 days</span><strong>{ai30 === null ? '—' : naira(ai30)}</strong><small>{ai30 === null ? 'Set AI_COST_NGN_PER_MILLION_TOKENS' : `Margin ${revenue30 ? Math.round(((revenue30 - ai30) / revenue30) * 100) : 0}%`}</small></article>
        <article className="panel"><span>Daily active users</span><strong>{number(avgActive)}</strong><small>Average over 7 days</small></article>
        <article className="panel"><span>Transfers waiting</span><strong>{number(financials.transfers_pending)}</strong><small>{financials.inbox_needs_review} inbox email{financials.inbox_needs_review === 1 ? '' : 's'} to review</small></article>
      </section>

      <div className="fin-bars" role="img" aria-label="Net revenue per day, last 30 days">
        {chartDays.map((day) => (
          <span key={day.day} style={{ height: `${Math.max(2, (gross(day) / maxRevenue) * 100)}%` }} className={gross(day) > 0 ? 'on' : ''}
            title={`${day.day}: ${naira(gross(day))} · ${day.payments} payment${day.payments === 1 ? '' : 's'}`} />
        ))}
      </div>

      <div className="admin-table-scroll">
        <table className="admin-table fin-table">
          <thead><tr><th>Day</th><th>Revenue</th><th>Payments</th><th>Sign-ups</th><th>Active</th><th>Prompts</th><th>AI tokens</th>{rate ? <th>AI cost</th> : null}</tr></thead>
          <tbody>{days.map((day) => (
            <tr key={day.day}>
              <td>{new Date(`${day.day}T12:00:00`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
              <td>{naira(gross(day))}{Number(day.refunds_kobo) > 0 ? <small> after {naira(Number(day.refunds_kobo))} refunds</small> : null}</td>
              <td>{day.payments}{day.renewals ? <small> · {day.renewals} renewal{day.renewals === 1 ? '' : 's'}</small> : null}</td>
              <td>{number(day.signups)}</td>
              <td>{number(day.active_users)}</td>
              <td>{number(day.prompts)}{day.enhancements ? <small> + {number(day.enhancements)} enh.</small> : null}</td>
              <td>{number(day.ai_tokens)}</td>
              {rate ? <td>{naira(aiCostKobo(Number(day.ai_tokens)) ?? 0)}</td> : null}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
