import type { StageDefinition } from '../types';
import { STAGES } from '../data';

const CATEGORY_RULES: Array<[string, RegExp]> = [
  ['beauty_skincare', /skincare|skin care|beauty|cosmetic|makeup|hair|barber|salon|\bspa\b|organic product/i],
  ['fashion', /fashion|clothing|tailor|sew|wear|outfit|thrift|shoe|bag|jewellery|jewelry/i],
  ['food', /food|kitchen|catering|cook|chef|restaurant|snack|bakery|bake|small chops|drink|juice/i],
  ['design_creative', /graphic|design|logo|brand identity|flyer|visual|illustration|photography|video|media/i],
  ['education', /tutor|teach|school|lesson|course|training|academy|student|jamb|waec/i],
  ['technology', /software|app|web|developer|coding|tech|digital|automation|data|artificial intelligence|\bai\b/i],
  ['commerce', /shop|store|vendor|retail|wholesale|e-?commerce|import|marketplace/i],
  ['finance', /payment|loan|savings|forex|invest|accounting|bookkeeping|insurance|\bpos\b/i],
  ['logistics', /logistics|delivery|dispatch|courier|transport|haulage|rider/i],
  ['professional_services', /consult|advis|agency|freelance|service|strategy|marketing|real estate|cleaning|event/i],
];

export function assignStage(scores: number[]): StageDefinition {
  if (!scores.length) return STAGES.launch;
  const average = scores.reduce((total, score) => total + score, 0) / scores.length;
  if (average < 1) return STAGES.validation;
  if (average < 2) return STAGES.launch;
  if (average < 3) return STAGES.scaling;
  return STAGES.exit;
}

export function classifyBusiness(description: string): string {
  const normalized = description.trim();
  if (!normalized) return 'other';
  return CATEGORY_RULES.find(([, expression]) => expression.test(normalized))?.[0] ?? 'other';
}

export function localPrompt(params: {
  goal: string;
  business: string;
  customer: string;
  context?: string;
  mentor?: string;
  stage?: string;
}): string {
  const context = params.context?.trim()
    ? `\n\nSpecific context for this task: ${params.context.trim()}.`
    : '';
  const mentor = params.mentor?.trim()
    ? ` Use the useful principles associated with ${params.mentor.trim()}, but do not imitate their exact voice.`
    : '';

  return `You are a commercially-minded business strategist with deep experience helping small businesses in Nigeria.${mentor}\n\nI run ${params.business.trim()}, serving ${params.customer.trim()}. I am currently at the ${params.stage ?? 'launch'} stage. My immediate goal is to ${params.goal.trim()}.${context}\n\nCreate the strongest usable output for this goal. Use relevant Nigerian context such as naira pricing, buyer trust, WhatsApp, Instagram, Paystack, delivery constraints and Lagos market dynamics only where they materially improve the answer.\n\nRequirements:\n- Be specific, practical and commercially aware.\n- Avoid generic motivational language.\n- Use a professional, warm and direct tone.\n- Make sensible assumptions explicit.\n- Keep the final output ready to copy, send or execute today.\n\nEnd with one concrete next action I can complete within 30 minutes.`;
}
