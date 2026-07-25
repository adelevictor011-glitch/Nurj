export interface GeneratedPayload {
  title: string;
  prompt: string;
  why_it_works: string;
  next_action: string;
}

export const generateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    prompt: { type: 'string' },
    why_it_works: { type: 'string' },
    next_action: { type: 'string' },
  },
  required: ['title', 'prompt', 'why_it_works', 'next_action'],
};

export const GENERATE_INSTRUCTIONS = `You are Nurj, a commercially rigorous prompt architect for Nigerian founders and side-hustle operators. Your job is to write the prompt the user should give another capable AI—not to complete the business task itself.

Build prompts with a precise expert role, concrete business context, exact objective, useful output format, quality constraints, Nigerian market context only when relevant, and one immediate execution endpoint. Do not imitate a living person's distinctive voice. You may apply broadly known principles associated with an expert, but state them as principles. Avoid generic motivation, stereotypes, fabricated data and unnecessary length. The final prompt must be ready to copy and use.`;

/**
 * Sector-specific priors. This is where the classifier stops being decoration
 * and starts making a caterer's first prompt better than a generic one.
 */
const CATEGORY_BRIEFS: Record<string, string> = {
  beauty_skincare: 'Trust and visible proof drive purchase. Before/after evidence, ingredient honesty, sensitive-skin reassurance, and NAFDAC/regulatory caution where claims are made.',
  fashion: 'Sizing confidence, fit guarantees, delivery timelines and returns are the real objections. Visual merchandising and restock urgency matter more than discounting.',
  food: 'Repeat purchase and hygiene trust dominate. Order lead time, delivery radius, minimum order value and packaging integrity are the decisive commercial variables.',
  design_creative: 'Buyers cannot judge quality in advance, so scope clarity, revision limits, turnaround time and a portfolio-anchored proof point carry the sale.',
  education: 'Outcome specificity and parent or sponsor approval drive conversion. Reference exam boards, timelines and measurable score or skill outcomes.',
  technology: 'Buyers need proof of reliability and support. Concrete integration steps, uptime, data handling and a low-risk first engagement reduce friction.',
  commerce: 'Margin per unit, stock turnover, supplier reliability and delivery cost decide viability. Price anchoring and bundle logic matter.',
  finance: 'Regulatory caution is mandatory. Never imply guaranteed returns. Emphasise record-keeping, verifiable numbers and transparent fee structures.',
  logistics: 'Reliability and proof of delivery are the product. Route density, per-drop cost, failed-delivery rate and dispatch capacity are the operating levers.',
  professional_services: 'Positioning, a specific ideal client and a clear engagement scope decide pricing power. Retainers beat one-off projects.',
  other: '',
};

const STAGE_BRIEFS: Record<string, string> = {
  validation: 'The constraint is evidence, not execution volume. Bias the prompt toward buyer conversations, falsifiable tests and commitment signals rather than building or branding.',
  launch: 'The constraint is pipeline. Bias the prompt toward outreach, offer clarity and closing the first paying customers, not systems or scale.',
  scaling: 'The constraint is repeatability. Bias the prompt toward delegation, documented process, margin discipline and channel consistency.',
  exit: 'The constraint is transferability. Bias the prompt toward clean financials, reduced founder dependency and defensible asset value.',
};

export function buildGenerateInput(params: {
  stage: string;
  goal: string;
  business: string;
  customer: string;
  context?: string;
  mentor?: string;
  category?: string;
}): string {
  const categoryBrief = CATEGORY_BRIEFS[params.category ?? 'other'] ?? '';
  const stageBrief = STAGE_BRIEFS[params.stage] ?? '';

  return `Growth stage: ${params.stage}
Goal: ${params.goal}
Business: ${params.business}
Target customer: ${params.customer}
Task context: ${params.context?.trim() || 'No extra context supplied.'}
Strategic influence: ${params.mentor?.trim() || 'None supplied.'}
${categoryBrief ? `\nSector dynamics to respect: ${categoryBrief}` : ''}${stageBrief ? `\nStage constraint to respect: ${stageBrief}` : ''}

Create a title, the complete prompt, a concise explanation of why it works, and one next action the founder can complete today.`;
}
