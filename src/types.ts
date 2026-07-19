export type StageKey = 'validation' | 'launch' | 'scaling' | 'exit';
export type PlanKey = 'free' | 'builder' | 'operator';
export type ScreenKey =
  | 'landing'
  | 'quiz'
  | 'result'
  | 'home'
  | 'generate'
  | 'enhance'
  | 'guides'
  | 'history'
  | 'account'
  | 'upgrade';

export interface QuizOption {
  label: string;
  value: number;
}

export interface QuizQuestion {
  question: string;
  helper: string;
  options: QuizOption[];
}

export interface StageDefinition {
  key: StageKey;
  label: string;
  number: number;
  eyebrow: string;
  description: string;
  signal: string;
  firstMove: string;
  metric: string;
  actions: string[];
}

export interface GoalDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export interface GuideItem {
  title: string;
  description: string;
  minutes: number;
  free?: boolean;
}

export interface GuideSection {
  title: string;
  items: GuideItem[];
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  business_description: string | null;
  target_customer: string | null;
  business_category: string | null;
  stage: StageKey | null;
  plan: PlanKey;
  plan_expires_at: string | null;
  onboarding_complete: boolean;
  momentum_score: number;
}

export interface UsageStatus {
  prompt: { used: number; limit: number | null; remaining: number | null };
  enhance: { used: number; limit: number | null; remaining: number | null };
}

export interface PromptHistoryItem {
  id: string;
  kind: 'generated' | 'enhanced';
  title: string;
  goal: string | null;
  output: Record<string, unknown>;
  created_at: string;
}

export interface GenerateResult {
  title: string;
  prompt: string;
  why_it_works: string;
  next_action: string;
  remaining: number | null;
}

export interface EnhanceResult {
  title: string;
  enhanced_prompt: string;
  diagnosis: string;
  changes: string[];
  remaining: number | null;
}
