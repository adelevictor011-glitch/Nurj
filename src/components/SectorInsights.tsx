import type { SectorInsights } from '../lib/api';

export function goalWinRate(insights: SectorInsights | null | undefined, goal: string) {
  return insights?.goals.find((item) => item.goal === goal) ?? null;
}

/**
 * "What's working in your sector" (roadmap feature 10). Built only from
 * results other people reported, and only once 30 reports exist for a goal,
 * so it switches on by itself as the data arrives.
 */
export function SectorInsightsCard({ insights, onUseGoal }: { insights: SectorInsights | null | undefined; onUseGoal: () => void }) {
  if (!insights) return null;
  const sector = insights.category.replaceAll('_', ' ');
  const live = insights.goals.slice(0, 3);

  return (
    <article className="panel insights-panel">
      <div className="panel-title">
        <div><span className="eyebrow">WHAT'S WORKING IN {sector.toUpperCase()}</span><h3>{live.length ? 'Moves other founders say worked' : 'Sector insights are warming up'}</h3></div>
        {insights.sector_worked_pct !== null && <span>{insights.sector_worked_pct}% of reported runs worked</span>}
      </div>
      {live.length ? (
        <>
          <ul className="insights-list">
            {live.map((item) => (
              <li key={item.goal}>
                <strong>{item.goal}</strong>
                <span className="insights-bar"><i style={{ width: `${item.worked_pct}%` }} /></span>
                <em>{item.worked_pct}% worked · {item.reports} reports</em>
              </li>
            ))}
          </ul>
          <button className="button button-secondary button-small" onClick={onUseGoal}>Try one in Studio</button>
        </>
      ) : (
        <p>
          When {insights.min_reports} people in your sector report whether a move worked, you'll see which ones pay off here.
          {insights.closest_goal
            ? ` Closest so far: "${insights.closest_goal.goal}" with ${insights.closest_goal.reports} of ${insights.min_reports} reports.`
            : ' Tap "Did it work?" after running a prompt to help get there.'}
        </p>
      )}
      <small>From anonymous results people reported in the last 6 months. Not a guarantee.</small>
    </article>
  );
}
