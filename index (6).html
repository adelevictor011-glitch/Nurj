import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarRange,
  Check,
  ChevronDown,
  CircleUserRound,
  Clipboard,
  Command,
  Copy,
  CreditCard,
  FileText,
  Gauge,
  History,
  Home,
  Layers3,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Orbit,
  PanelLeftClose,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WandSparkles,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { GOALS, GUIDES, QUIZ, STAGES } from './data';
import { api } from './lib/api';
import { assignStage, classifyBusiness, localPrompt } from './lib/business';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type {
  EnhanceResult,
  GenerateResult,
  PlanKey,
  PromptHistoryItem,
  ScreenKey,
  StageKey,
  UsageStatus,
  UserProfile,
} from './types';

const EMPTY_USAGE: UsageStatus = {
  prompt: { used: 0, limit: 5, remaining: 5 },
  enhance: { used: 0, limit: 3, remaining: 3 },
};

const ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  Mail,
  Target,
  BadgeNaira: CreditCard,
  CalendarRange,
  FileText,
  Rocket,
  Sparkles,
};

const NAV_ITEMS: Array<{ screen: ScreenKey; label: string; icon: LucideIcon }> = [
  { screen: 'home', label: 'Command', icon: Home },
  { screen: 'generate', label: 'Studio', icon: WandSparkles },
  { screen: 'enhance', label: 'Enhance', icon: BrainCircuit },
  { screen: 'guides', label: 'Playbooks', icon: BookOpen },
  { screen: 'history', label: 'History', icon: History },
];

const DEFAULT_PROFILE: UserProfile = {
  id: 'guest',
  display_name: 'Builder',
  business_description: null,
  target_customer: null,
  business_category: null,
  stage: null,
  plan: 'free',
  plan_expires_at: null,
  onboarding_complete: false,
  momentum_score: 18,
};

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [screen, setScreen] = useState<ScreenKey>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile>(() => loadLocal('nurj-profile-v2', DEFAULT_PROFILE));
  const [usage, setUsage] = useState<UsageStatus>(EMPTY_USAGE);
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [guestMode, setGuestMode] = useState(() => loadLocal('nurj-guest-v2', false));
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState<PlanKey | null>(null);

  const inApp = !['landing', 'quiz', 'result', 'upgrade'].includes(screen);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const syncStatus = useCallback(async () => {
    if (!user) return;
    try {
      const status = await api.status();
      setProfile(status.profile);
      setUsage(status.usage);
      setHistory(status.history);
      localStorage.setItem('nurj-profile-v2', JSON.stringify(status.profile));
      setScreen(status.profile.onboarding_complete ? 'home' : 'quiz');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load your workspace.');
    }
  }, [notify, user]);

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) void syncStatus();
  }, [syncStatus, user]);

  useEffect(() => {
    localStorage.setItem('nurj-profile-v2', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('nurj-guest-v2', JSON.stringify(guestMode));
  }, [guestMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') ?? params.get('trxref');
    if (!reference || !user) return;

    void api
      .verifyPayment(reference)
      .then(async (result) => {
        notify(`${result.plan === 'builder' ? 'Builder' : 'Operator'} is now active.`);
        window.history.replaceState({}, '', window.location.pathname);
        await syncStatus();
      })
      .catch((error) => notify(error instanceof Error ? error.message : 'Payment verification failed.'));
  }, [notify, syncStatus, user]);

  async function signIn() {
    if (!supabase) {
      notify('Add your Supabase environment variables to enable Google sign-in.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) notify(error.message);
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setUser(null);
    setGuestMode(false);
    setProfile(DEFAULT_PROFILE);
    setUsage(EMPTY_USAGE);
    setHistory([]);
    setScreen('landing');
  }

  function startGuest() {
    setGuestMode(true);
    setScreen('quiz');
  }

  async function completeQuiz(stageKey: StageKey) {
    const nextProfile: UserProfile = {
      ...profile,
      id: user?.id ?? 'guest',
      display_name: user?.user_metadata.full_name ?? profile.display_name ?? 'Builder',
      stage: stageKey,
      onboarding_complete: true,
      momentum_score: 24,
    };
    setProfile(nextProfile);

    if (user && supabase) {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: nextProfile.display_name,
        stage: stageKey,
        onboarding_complete: true,
        momentum_score: 24,
        updated_at: new Date().toISOString(),
      });
      if (error) notify(error.message);
    }

    setScreen('result');
  }

  async function beginPayment(plan: 'builder' | 'operator') {
    if (!user) {
      notify('Sign in before activating a plan.');
      await signIn();
      return;
    }
    setPaymentBusy(plan);
    try {
      const checkout = await api.initializePayment(plan);
      window.location.assign(checkout.authorization_url);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Checkout could not be started.');
      setPaymentBusy(null);
    }
  }

  if (!authReady) {
    return <LoadingScreen />;
  }

  return (
    <div className="app-root">
      <Ambient />
      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <Page key="landing">
            <Landing onSignIn={signIn} onGuest={startGuest} configured={isSupabaseConfigured} />
          </Page>
        )}
        {screen === 'quiz' && (
          <Page key="quiz">
            <Quiz onComplete={completeQuiz} onBack={() => setScreen('landing')} />
          </Page>
        )}
        {screen === 'result' && (
          <Page key="result">
            <ResultScreen stageKey={profile.stage ?? 'launch'} onContinue={() => setScreen('home')} />
          </Page>
        )}
        {screen === 'upgrade' && (
          <Page key="upgrade">
            <Upgrade
              currentPlan={profile.plan}
              busy={paymentBusy}
              onBack={() => setScreen(inApp ? 'home' : 'home')}
              onChoose={beginPayment}
            />
          </Page>
        )}
        {inApp && (
          <Page key="workspace">
            <WorkspaceShell
              screen={screen}
              setScreen={setScreen}
              profile={profile}
              user={user}
              compact={sidebarCompact}
              onCompact={() => setSidebarCompact((value) => !value)}
              mobileMenu={mobileMenu}
              setMobileMenu={setMobileMenu}
              onSignOut={signOut}
            >
              {screen === 'home' && (
                <Dashboard
                  profile={profile}
                  usage={usage}
                  history={history}
                  onNavigate={setScreen}
                  onProfile={setProfile}
                />
              )}
              {screen === 'generate' && (
                <PromptStudio
                  profile={profile}
                  usage={usage}
                  authenticated={Boolean(user)}
                  onUsage={setUsage}
                  onHistory={(item) => setHistory((items) => [item, ...items])}
                  onProfile={setProfile}
                  onUpgrade={() => setScreen('upgrade')}
                  notify={notify}
                />
              )}
              {screen === 'enhance' && (
                <Enhancer
                  profile={profile}
                  usage={usage}
                  authenticated={Boolean(user)}
                  onUsage={setUsage}
                  onUpgrade={() => setScreen('upgrade')}
                  notify={notify}
                />
              )}
              {screen === 'guides' && <Guides stageKey={profile.stage ?? 'launch'} plan={profile.plan} />}
              {screen === 'history' && <HistoryScreen history={history} notify={notify} />}
              {screen === 'account' && (
                <Account
                  profile={profile}
                  user={user}
                  onProfile={setProfile}
                  onUpgrade={() => setScreen('upgrade')}
                  notify={notify}
                />
              )}
            </WorkspaceShell>
          </Page>
        )}
      </AnimatePresence>
      <AnimatePresence>{toast && <Toast message={toast} />}</AnimatePresence>
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3, ease: [0.22, 0.8, 0.32, 1] }}
      className="page-motion"
    >
      {children}
    </motion.div>
  );
}

function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-orb ambient-orb-gold" />
      <div className="ambient-orb ambient-orb-lime" />
      <div className="ambient-grid" />
      <div className="noise" />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">N</div>
      {!compact && (
        <div>
          <strong>NURJ</strong>
          <span>Business intelligence</span>
        </div>
      )}
    </div>
  );
}

function Landing({
  onSignIn,
  onGuest,
  configured,
}: {
  onSignIn: () => void;
  onGuest: () => void;
  configured: boolean;
}) {
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <Brand />
        <div className="landing-nav-actions">
          <span className="system-status"><i /> Systems ready</span>
          <button className="button button-ghost button-small" onClick={onSignIn}>Sign in</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="signal-pill"><Orbit size={14} /> Built for how Nigerian businesses actually move</div>
          <h1>Build the business.<br /><em>Not just the prompt.</em></h1>
          <p>
            Nurj reads where your side hustle is, identifies the constraint, and turns your next move into precise AI execution.
          </p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={onGuest}>
              Run my signal scan <ArrowRight size={17} />
            </button>
            <button className="button button-secondary" onClick={onSignIn}>
              Continue with Google
            </button>
          </div>
          <p className="hero-microcopy">
            <ShieldCheck size={14} /> Five questions. One clear move. No credit card.
            {!configured && <span className="demo-note"> Demo mode is active until Supabase is configured.</span>}
          </p>
        </div>

        <div className="hero-product">
          <div className="product-window">
            <div className="window-topbar">
              <div className="window-dots"><i /><i /><i /></div>
              <span>nurj / command</span>
              <div className="live-chip"><i /> live</div>
            </div>
            <div className="window-body">
              <div className="mini-sidebar">
                <Brand compact />
                {[Command, WandSparkles, BookOpen, BarChart3].map((Icon, index) => (
                  <span className={index === 0 ? 'active' : ''} key={index}><Icon size={17} /></span>
                ))}
              </div>
              <div className="mini-dashboard">
                <div className="mini-head">
                  <div><small>MONDAY SIGNAL</small><h3>One move. Done properly.</h3></div>
                  <div className="score-ring">38</div>
                </div>
                <div className="command-card-preview">
                  <div className="preview-label"><Zap size={13} /> HIGHEST-LEVERAGE MOVE</div>
                  <h4>Send five specific outreach messages.</h4>
                  <p>Not more content. Not a new logo. Start five buyer conversations.</p>
                  <button>Generate execution prompt <ArrowRight size={14} /></button>
                </div>
                <div className="mini-grid">
                  <div><small>STAGE</small><strong>Launch</strong><span>2 of 4</span></div>
                  <div><small>FOCUS</small><strong>Pipeline</strong><span>5 outreaches</span></div>
                  <div><small>MOMENTUM</small><strong>+12%</strong><span>This week</span></div>
                </div>
                <div className="prompt-stream">
                  <span className="ai-symbol"><Sparkles size={15} /></span>
                  <p><b>Nurj is shaping the prompt</b><br />Adding buyer context, Nigerian market dynamics and a concrete close…</p>
                  <i />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="capability-strip">
        {[
          ['01', 'Signal scan', 'Find your actual growth stage in five questions.'],
          ['02', 'Prompt studio', 'Translate business context into precise AI instructions.'],
          ['03', 'Playbooks', 'Learn only what matters at your current stage.'],
          ['04', 'Momentum layer', 'Keep the next move visible and measurable.'],
        ].map(([number, title, description]) => (
          <article key={number}>
            <span>{number}</span><h3>{title}</h3><p>{description}</p>
          </article>
        ))}
      </section>

      <section className="future-statement">
        <div className="future-line" />
        <p>Less AI theatre. More commercial movement.</p>
        <div className="future-line" />
      </section>
    </main>
  );
}

function Quiz({ onComplete, onBack }: { onComplete: (stage: StageKey) => void; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const question = QUIZ[index];

  function answer(value: number) {
    const nextScores = [...scores, value];
    if (index === QUIZ.length - 1) {
      void onComplete(assignStage(nextScores).key);
      return;
    }
    setScores(nextScores);
    setIndex((valueIndex) => valueIndex + 1);
  }

  function back() {
    if (index === 0) return onBack();
    setIndex((valueIndex) => valueIndex - 1);
    setScores((values) => values.slice(0, -1));
  }

  return (
    <main className="focus-shell">
      <div className="focus-top"><Brand /><span>Signal scan · {index + 1}/{QUIZ.length}</span></div>
      <div className="quiz-progress"><i style={{ width: `${((index + 1) / QUIZ.length) * 100}%` }} /></div>
      <section className="quiz-card">
        <button className="icon-button" onClick={back} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="quiz-number">0{index + 1}</div>
        <h1>{question.question}</h1>
        <p>{question.helper}</p>
        <div className="quiz-options">
          {question.options.map((option, optionIndex) => (
            <motion.button
              whileTap={{ scale: 0.985 }}
              onClick={() => answer(option.value)}
              key={option.label}
            >
              <span>{String.fromCharCode(65 + optionIndex)}</span>
              {option.label}
              <ArrowRight size={16} />
            </motion.button>
          ))}
        </div>
      </section>
    </main>
  );
}

function ResultScreen({ stageKey, onContinue }: { stageKey: StageKey; onContinue: () => void }) {
  const stage = STAGES[stageKey];
  return (
    <main className="focus-shell result-shell">
      <div className="focus-top"><Brand /><span>Signal acquired</span></div>
      <section className="result-card">
        <div className="stage-orbit"><div><span>STAGE {stage.number}</span><strong>{stage.label}</strong></div></div>
        <div className="result-copy">
          <span className="eyebrow">{stage.eyebrow}</span>
          <h1>Your business is in its <em>{stage.label}</em> era.</h1>
          <p>{stage.description}</p>
          <blockquote>{stage.signal}</blockquote>
          <div className="first-move">
            <span><Zap size={15} /> Your next move</span>
            <strong>{stage.firstMove}</strong>
            <small>Success signal: {stage.metric}</small>
          </div>
          <button className="button button-primary" onClick={onContinue}>Open my command centre <ArrowRight size={17} /></button>
        </div>
      </section>
    </main>
  );
}

function WorkspaceShell({
  children,
  screen,
  setScreen,
  profile,
  user,
  compact,
  onCompact,
  mobileMenu,
  setMobileMenu,
  onSignOut,
}: {
  children: React.ReactNode;
  screen: ScreenKey;
  setScreen: (screen: ScreenKey) => void;
  profile: UserProfile;
  user: User | null;
  compact: boolean;
  onCompact: () => void;
  mobileMenu: boolean;
  setMobileMenu: (open: boolean) => void;
  onSignOut: () => void;
}) {
  return (
    <div className={`workspace ${compact ? 'sidebar-compact' : ''}`}>
      <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
        <div className="sidebar-head"><Brand compact={compact} /><button className="desktop-collapse" onClick={onCompact}><PanelLeftClose size={17} /></button></div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ screen: itemScreen, label, icon: Icon }) => (
            <button
              className={screen === itemScreen ? 'active' : ''}
              onClick={() => { setScreen(itemScreen); setMobileMenu(false); }}
              key={itemScreen}
              title={compact ? label : undefined}
            >
              <Icon size={19} /><span>{label}</span>{screen === itemScreen && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-stage">
          <div className="stage-mini-orbit">{STAGES[profile.stage ?? 'launch'].number}</div>
          {!compact && <div><small>CURRENT STAGE</small><strong>{STAGES[profile.stage ?? 'launch'].label}</strong></div>}
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => { setScreen('account'); setMobileMenu(false); }}><CircleUserRound size={19} /><span>{user ? 'Account' : 'Guest profile'}</span></button>
          <button onClick={onSignOut}><LogOut size={19} /><span>{user ? 'Sign out' : 'Exit guest'}</span></button>
        </div>
      </aside>
      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Close menu" />}
      <section className="workspace-main">
        <header className="app-header">
          <button className="mobile-menu-button" onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
          <div className="app-header-context">
            <span>{NAV_ITEMS.find((item) => item.screen === screen)?.label ?? 'Account'}</span>
            <i />
            <small>{profile.plan === 'free' ? 'Free workspace' : `${profile.plan} active`}</small>
          </div>
          <button className="avatar-button" onClick={() => setScreen('account')}>
            {(profile.display_name ?? user?.email ?? 'N').slice(0, 1).toUpperCase()}
          </button>
        </header>
        <div className="workspace-content">{children}</div>
        <nav className="mobile-bottom-nav">
          {NAV_ITEMS.slice(0, 4).map(({ screen: itemScreen, label, icon: Icon }) => (
            <button className={screen === itemScreen ? 'active' : ''} onClick={() => setScreen(itemScreen)} key={itemScreen}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
      </section>
    </div>
  );
}

function Dashboard({
  profile,
  usage,
  history,
  onNavigate,
  onProfile,
}: {
  profile: UserProfile;
  usage: UsageStatus;
  history: PromptHistoryItem[];
  onNavigate: (screen: ScreenKey) => void;
  onProfile: (profile: UserProfile) => void;
}) {
  const stage = STAGES[profile.stage ?? 'launch'];
  const [completed, setCompleted] = useState<number[]>(() => loadLocal('nurj-actions-v2', []));
  const firstName = profile.display_name?.split(' ')[0] ?? 'Builder';

  function toggleAction(index: number) {
    const next = completed.includes(index) ? completed.filter((item) => item !== index) : [...completed, index];
    setCompleted(next);
    localStorage.setItem('nurj-actions-v2', JSON.stringify(next));
    onProfile({ ...profile, momentum_score: Math.min(100, 24 + next.length * 13) });
  }

  return (
    <div className="screen-stack">
      <section className="screen-heading dashboard-heading">
        <div><span className="eyebrow">COMMAND CENTRE</span><h1>Good morning, {firstName}.</h1><p>Protect the move that creates the next commercial signal.</p></div>
        <div className="date-chip"><span>WEEK 01</span><strong>Momentum cycle</strong></div>
      </section>

      <section className="dashboard-command-grid">
        <article className="primary-command-card">
          <div className="command-topline"><span><Zap size={14} /> HIGHEST-LEVERAGE MOVE</span><small>Today</small></div>
          <h2>{stage.firstMove}</h2>
          <p>{stage.signal}</p>
          <div className="command-actions">
            <button className="button button-primary" onClick={() => onNavigate('generate')}>Build the execution prompt <ArrowRight size={16} /></button>
            <span>Success: {stage.metric}</span>
          </div>
        </article>
        <article className="momentum-card">
          <div className="momentum-orbit" style={{ '--score': `${profile.momentum_score * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{profile.momentum_score}</strong><span>momentum</span></div>
          </div>
          <div><span className="eyebrow">WEEKLY SIGNAL</span><h3>{profile.momentum_score < 40 ? 'Build the rhythm' : 'Momentum is forming'}</h3><p>Complete focused actions to strengthen the signal.</p></div>
        </article>
      </section>

      <section className="metric-grid">
        <Metric icon={Layers3} label="Business stage" value={stage.label} foot={`Stage ${stage.number} of 4`} />
        <Metric icon={WandSparkles} label="Prompts today" value={`${usage.prompt.used}/${usage.prompt.limit ?? '∞'}`} foot="Server-tracked usage" />
        <Metric icon={BrainCircuit} label="Enhancements" value={`${usage.enhance.used}/${usage.enhance.limit ?? '∞'}`} foot="Clarity upgrades" />
        <Metric icon={TrendingUp} label="Primary focus" value={stage.eyebrow} foot="Until the signal changes" />
      </section>

      <section className="dashboard-lower-grid">
        <article className="panel action-panel">
          <div className="panel-title"><div><span className="eyebrow">THIS WEEK</span><h3>Three moves, in order.</h3></div><span>{completed.length}/3 done</span></div>
          <div className="action-list">
            {stage.actions.map((action, index) => (
              <button className={completed.includes(index) ? 'done' : ''} onClick={() => toggleAction(index)} key={action}>
                <span className="check-box">{completed.includes(index) && <Check size={14} />}</span>
                <div><small>0{index + 1}</small><strong>{action}</strong></div>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </article>
        <article className="panel recent-panel">
          <div className="panel-title"><div><span className="eyebrow">RECENT INTELLIGENCE</span><h3>Your latest work</h3></div><button onClick={() => onNavigate('history')}>View all</button></div>
          {history.length ? (
            <div className="recent-list">
              {history.slice(0, 3).map((item) => (
                <div key={item.id}><span>{item.kind === 'generated' ? <WandSparkles size={15} /> : <BrainCircuit size={15} />}</span><div><strong>{item.title}</strong><small>{new Date(item.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</small></div></div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact"><Sparkles size={22} /><strong>Your intelligence trail starts here.</strong><p>Generate a prompt and it will appear in this workspace.</p></div>
          )}
        </article>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, foot }: { icon: LucideIcon; label: string; value: string; foot: string }) {
  return <article className="metric-card"><div><Icon size={17} /></div><span>{label}</span><strong>{value}</strong><small>{foot}</small></article>;
}

function PromptStudio({
  profile,
  usage,
  authenticated,
  onUsage,
  onHistory,
  onProfile,
  onUpgrade,
  notify,
}: {
  profile: UserProfile;
  usage: UsageStatus;
  authenticated: boolean;
  onUsage: (usage: UsageStatus) => void;
  onHistory: (item: PromptHistoryItem) => void;
  onProfile: (profile: UserProfile) => void;
  onUpgrade: () => void;
  notify: (message: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [goalId, setGoalId] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [business, setBusiness] = useState(profile.business_description ?? '');
  const [customer, setCustomer] = useState(profile.target_customer ?? '');
  const [context, setContext] = useState('');
  const [mentor, setMentor] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const selectedGoal = GOALS.find((goal) => goal.id === goalId);
  const goal = goalId === 'custom' ? customGoal : selectedGoal?.label ?? '';
  const overLimit = profile.plan === 'free' && usage.prompt.remaining === 0;

  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!goal.trim() || !business.trim() || !customer.trim()) return;
    if (overLimit) return onUpgrade();
    setBusy(true);
    setStep(3);

    try {
      let nextResult: GenerateResult;
      if (authenticated) {
        nextResult = await api.generate({
          goal,
          business,
          customer,
          context,
          mentor,
          stage: profile.stage ?? 'launch',
        });
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        nextResult = {
          title: `${goal} — execution prompt`,
          prompt: localPrompt({ goal, business, customer, context, mentor, stage: profile.stage ?? 'launch' }),
          why_it_works: 'It gives the AI a specific role, commercial context, a concrete output and a short execution horizon.',
          next_action: 'Copy the prompt into your preferred AI tool and complete the output today.',
          remaining: Math.max(0, (usage.prompt.remaining ?? 5) - 1),
        };
      }
      setResult(nextResult);
      onUsage({ ...usage, prompt: { ...usage.prompt, used: usage.prompt.used + 1, remaining: nextResult.remaining } });
      onProfile({
        ...profile,
        business_description: business,
        target_customer: customer,
        business_category: classifyBusiness(business),
        momentum_score: Math.min(100, profile.momentum_score + 4),
      });
      onHistory({
        id: crypto.randomUUID(),
        kind: 'generated',
        title: nextResult.title,
        goal,
        output: { ...nextResult },
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Nurj could not generate this prompt.');
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setGoalId('');
    setCustomGoal('');
    setContext('');
    setMentor('');
    setResult(null);
  }

  return (
    <div className="screen-stack studio-screen">
      <section className="screen-heading">
        <div><span className="eyebrow">PROMPT STUDIO</span><h1>Turn context into execution.</h1><p>Nurj architects the instruction. Your AI produces the work.</p></div>
        <UsagePill used={usage.prompt.used} limit={usage.prompt.limit} label="prompts today" />
      </section>
      <div className="studio-layout">
        <aside className="studio-steps">
          {[
            [1, 'Outcome', 'Choose the move'],
            [2, 'Context', 'Make it specific'],
            [3, 'Prompt', 'Ready to execute'],
          ].map(([number, title, text]) => (
            <div className={step === number ? 'active' : step > Number(number) ? 'done' : ''} key={number}>
              <span>{step > Number(number) ? <Check size={14} /> : number}</span><div><strong>{title}</strong><small>{text}</small></div>
            </div>
          ))}
          <div className="studio-principle"><Sparkles size={17} /><p><strong>Nurj principle</strong>Specific context creates useful intelligence.</p></div>
        </aside>
        <main className="studio-canvas panel">
          {step === 1 && (
            <div>
              <div className="canvas-heading"><span>STEP 01</span><h2>What must move next?</h2><p>Choose one outcome. Precision begins with a single job.</p></div>
              <div className="goal-grid">
                {GOALS.map((goalItem) => {
                  const Icon = ICONS[goalItem.icon] ?? Sparkles;
                  return (
                    <button className={goalId === goalItem.id ? 'selected' : ''} onClick={() => setGoalId(goalItem.id)} key={goalItem.id}>
                      <span><Icon size={19} /></span><strong>{goalItem.label}</strong><p>{goalItem.description}</p><i><Check size={12} /></i>
                    </button>
                  );
                })}
              </div>
              {goalId === 'custom' && <textarea className="field" value={customGoal} onChange={(event) => setCustomGoal(event.target.value)} placeholder="Describe the exact task, e.g. negotiate a rent increase for my studio without damaging the landlord relationship." />}
              <div className="canvas-footer"><span /><button className="button button-primary" disabled={!goal.trim()} onClick={() => setStep(2)}>Add business context <ArrowRight size={16} /></button></div>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={generate}>
              <div className="canvas-heading"><span>STEP 02</span><h2>Make the intelligence yours.</h2><p>Two required details separate a generic template from a commercial tool.</p></div>
              <div className="form-grid">
                <label className="full"><span>Your business <b>required</b></span><input className="field" value={business} onChange={(event) => setBusiness(event.target.value)} placeholder="A one-person brand identity studio for Nigerian fashion businesses" /><small>{business ? `Detected intelligence segment: ${classifyBusiness(business).replaceAll('_', ' ')}` : 'Describe the business in one clear sentence.'}</small></label>
                <label className="full"><span>Target customer <b>required</b></span><input className="field" value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Founder-led fashion brands in Lagos selling through Instagram" /></label>
                <label><span>Task context <em>optional</em></span><textarea className="field" value={context} onChange={(event) => setContext(event.target.value)} placeholder="What is happening, what has been tried, important constraints…" /></label>
                <label><span>Strategic influence <em>optional</em></span><textarea className="field" value={mentor} onChange={(event) => setMentor(event.target.value)} placeholder="A framework or expert whose principles are relevant—not an imitation request." /></label>
              </div>
              <div className="context-summary"><Gauge size={17} /><div><strong>Context quality</strong><span>{business && customer ? context ? 'High signal' : 'Good foundation' : 'Needs required details'}</span></div><i style={{ width: business && customer ? context ? '92%' : '68%' : '20%' }} /></div>
              <div className="canvas-footer"><button type="button" className="button button-ghost" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button><button className="button button-primary" disabled={!business.trim() || !customer.trim() || busy}>{overLimit ? 'Upgrade to continue' : 'Architect my prompt'} <Sparkles size={16} /></button></div>
            </form>
          )}

          {step === 3 && (
            <div className="result-output">
              <div className="canvas-heading"><span>STEP 03</span><h2>{busy ? 'Architecting the prompt…' : result?.title ?? 'Your prompt'}</h2><p>{busy ? 'Structuring role, context, format and constraints.' : 'Ready to copy into ChatGPT or another capable AI.'}</p></div>
              {busy ? <IntelligenceLoader /> : result && (
                <>
                  <div className="prompt-output-box"><div className="output-toolbar"><span><Sparkles size={14} /> NURJ PROMPT</span><CopyButton text={result.prompt} notify={notify} /></div><pre>{result.prompt}</pre></div>
                  <div className="output-insight-grid"><div><span>WHY IT WORKS</span><p>{result.why_it_works}</p></div><div><span>NEXT ACTION</span><p>{result.next_action}</p></div></div>
                  <div className="canvas-footer"><button className="button button-ghost" onClick={reset}>Build another</button><CopyButton text={result.prompt} notify={notify} primary /></div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Enhancer({
  profile,
  usage,
  authenticated,
  onUsage,
  onUpgrade,
  notify,
}: {
  profile: UserProfile;
  usage: UsageStatus;
  authenticated: boolean;
  onUsage: (usage: UsageStatus) => void;
  onUpgrade: () => void;
  notify: (message: string) => void;
}) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<EnhanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const overLimit = profile.plan === 'free' && usage.enhance.remaining === 0;

  async function enhance() {
    if (!input.trim()) return;
    if (overLimit) return onUpgrade();
    setBusy(true);
    try {
      let next: EnhanceResult;
      if (authenticated) {
        next = await api.enhance({ prompt: input, stage: profile.stage ?? 'launch', business: profile.business_description });
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 850));
        next = {
          title: 'Commercially stronger prompt',
          enhanced_prompt: `You are a commercially-minded strategist with deep experience in the relevant Nigerian market.\n\nBusiness context: [Describe the business, customer and current situation.]\n\nTask: ${input.trim()}\n\nProduce a specific, usable result. State assumptions, avoid generic advice, include an appropriate format, and prioritise the one action most likely to create revenue or validated learning. Use Nigerian context only where relevant.\n\nEnd with a concrete next step that can be completed within 30 minutes.`,
          diagnosis: 'The original request identifies a task but does not define the role, business context, output structure or success condition.',
          changes: ['Added an expert lens', 'Added missing context placeholders', 'Defined quality constraints', 'Added a concrete execution endpoint'],
          remaining: Math.max(0, (usage.enhance.remaining ?? 3) - 1),
        };
      }
      setResult(next);
      onUsage({ ...usage, enhance: { ...usage.enhance, used: usage.enhance.used + 1, remaining: next.remaining } });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The prompt could not be enhanced.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen-stack">
      <section className="screen-heading"><div><span className="eyebrow">PROMPT ENHANCER</span><h1>Weak in. Precise out.</h1><p>See what the prompt is missing, then rebuild it around the result you need.</p></div><UsagePill used={usage.enhance.used} limit={usage.enhance.limit} label="enhancements" /></section>
      <section className="enhancer-grid">
        <article className="panel enhancer-input">
          <div className="panel-title"><div><span className="eyebrow">ORIGINAL</span><h3>Paste the prompt as it is.</h3></div><Clipboard size={18} /></div>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="e.g. Write a caption for my business…" />
          <div className="enhancer-controls"><span>{input.length} characters</span><button className="button button-primary" disabled={!input.trim() || busy} onClick={enhance}>{overLimit ? 'Upgrade to continue' : busy ? 'Rebuilding…' : 'Enhance prompt'} <Sparkles size={16} /></button></div>
        </article>
        <article className="panel enhancer-output">
          <div className="panel-title"><div><span className="eyebrow">REBUILT</span><h3>{result?.title ?? 'The stronger version appears here.'}</h3></div>{result && <CopyButton text={result.enhanced_prompt} notify={notify} />}</div>
          {busy ? <IntelligenceLoader /> : result ? (
            <>
              <pre>{result.enhanced_prompt}</pre>
              <div className="diagnosis"><span>DIAGNOSIS</span><p>{result.diagnosis}</p></div>
              <div className="change-list">{result.changes.map((change) => <span key={change}><Check size={13} /> {change}</span>)}</div>
            </>
          ) : <div className="empty-state"><BrainCircuit size={30} /><strong>Clarity begins with contrast.</strong><p>Nurj will show the rebuilt prompt, the diagnosis and every meaningful change.</p></div>}
        </article>
      </section>
    </div>
  );
}

function Guides({ stageKey, plan }: { stageKey: StageKey; plan: PlanKey }) {
  const [activeStage, setActiveStage] = useState(stageKey);
  const [open, setOpen] = useState(0);
  return (
    <div className="screen-stack">
      <section className="screen-heading"><div><span className="eyebrow">STAGE PLAYBOOKS</span><h1>Learn at the speed of the constraint.</h1><p>No giant course library. Only the knowledge required for the next stage.</p></div><div className="plan-chip"><BookOpen size={15} /> {plan === 'free' ? 'Free library' : 'Full library'}</div></section>
      <div className="stage-tabs">{Object.values(STAGES).map((item) => <button className={activeStage === item.key ? 'active' : ''} onClick={() => { setActiveStage(item.key); setOpen(0); }} key={item.key}><span>0{item.number}</span>{item.label}</button>)}</div>
      <section className="guide-layout">
        <article className="guide-stage-card"><span>{STAGES[activeStage].eyebrow}</span><h2>{STAGES[activeStage].label}</h2><p>{STAGES[activeStage].description}</p><blockquote>{STAGES[activeStage].signal}</blockquote></article>
        <div className="guide-sections">
          {GUIDES[activeStage].map((section, index) => (
            <article className={`guide-section panel ${open === index ? 'open' : ''}`} key={section.title}>
              <button className="guide-section-head" onClick={() => setOpen(open === index ? -1 : index)}><div><span>0{index + 1}</span><h3>{section.title}</h3><small>{section.items.length} playbooks</small></div><ChevronDown size={18} /></button>
              <AnimatePresence initial={false}>{open === index && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="guide-items">{section.items.map((item) => { const locked = !item.free && plan === 'free'; return <button className={locked ? 'locked' : ''} key={item.title}><span className="guide-play"><BookOpen size={15} /></span><div><strong>{item.title}</strong><p>{item.description}</p><small>{item.minutes} min read · {locked ? 'Builder' : 'Available'}</small></div><ArrowRight size={15} /></button>; })}</motion.div>}</AnimatePresence>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function HistoryScreen({ history, notify }: { history: PromptHistoryItem[]; notify: (message: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'generated' | 'enhanced'>('all');
  const items = history.filter((item) => filter === 'all' || item.kind === filter);
  return (
    <div className="screen-stack">
      <section className="screen-heading"><div><span className="eyebrow">INTELLIGENCE HISTORY</span><h1>Your work should compound.</h1><p>Reuse, adapt and learn from the prompts that moved the business.</p></div><div className="filter-buttons">{(['all', 'generated', 'enhanced'] as const).map((value) => <button className={filter === value ? 'active' : ''} onClick={() => setFilter(value)} key={value}>{value}</button>)}</div></section>
      {items.length ? <div className="history-grid">{items.map((item) => { const prompt = String(item.output.prompt ?? item.output.enhanced_prompt ?? ''); return <article className="panel history-card" key={item.id}><div><span>{item.kind === 'generated' ? <WandSparkles size={15} /> : <BrainCircuit size={15} />}{item.kind}</span><small>{new Date(item.created_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div><h3>{item.title}</h3><p>{prompt.slice(0, 190)}{prompt.length > 190 ? '…' : ''}</p><button onClick={() => { void navigator.clipboard.writeText(prompt); notify('Copied from history.'); }}><Copy size={14} /> Copy prompt</button></article>; })}</div> : <div className="empty-state large panel"><History size={34} /><strong>No saved intelligence yet.</strong><p>Your authenticated generations will be saved here automatically.</p></div>}
    </div>
  );
}

function Account({
  profile,
  user,
  onProfile,
  onUpgrade,
  notify,
}: {
  profile: UserProfile;
  user: User | null;
  onProfile: (profile: UserProfile) => void;
  onUpgrade: () => void;
  notify: (message: string) => void;
}) {
  const [name, setName] = useState(profile.display_name ?? '');
  const [business, setBusiness] = useState(profile.business_description ?? '');
  const [customer, setCustomer] = useState(profile.target_customer ?? '');
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = { ...profile, display_name: name, business_description: business, target_customer: customer, business_category: classifyBusiness(business) };
    setSaving(true);
    if (user && supabase) {
      const { error } = await supabase.from('profiles').update({ display_name: name, business_description: business, target_customer: customer, business_category: classifyBusiness(business), updated_at: new Date().toISOString() }).eq('id', user.id);
      if (error) { notify(error.message); setSaving(false); return; }
    }
    onProfile(next);
    notify('Workspace profile saved.');
    setSaving(false);
  }

  return (
    <div className="screen-stack account-screen">
      <section className="screen-heading"><div><span className="eyebrow">WORKSPACE SETTINGS</span><h1>Keep Nurj close to the business.</h1><p>Your saved context makes every future prompt faster and more specific.</p></div></section>
      <section className="account-grid">
        <form className="panel account-form" onSubmit={save}><div className="panel-title"><div><span className="eyebrow">BUSINESS PROFILE</span><h3>Core context</h3></div><Settings2 size={18} /></div><label><span>Your name</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Business description</span><textarea className="field" value={business} onChange={(event) => setBusiness(event.target.value)} placeholder="What you sell and the outcome it creates" /></label><label><span>Target customer</span><textarea className="field" value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="The specific people or companies you serve" /></label><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save workspace'}</button></form>
        <div className="account-side">
          <article className="panel plan-card"><span className="eyebrow">CURRENT PLAN</span><div><h3>{profile.plan === 'free' ? 'Free' : profile.plan === 'builder' ? 'Builder' : 'Operator'}</h3><span className="plan-live"><i /> active</span></div><p>{profile.plan === 'free' ? 'Five prompts and three enhancements each day.' : `Access active${profile.plan_expires_at ? ` until ${new Date(profile.plan_expires_at).toLocaleDateString('en-NG')}` : ''}.`}</p><button className="button button-secondary" onClick={onUpgrade}>{profile.plan === 'free' ? 'Explore plans' : 'Manage access'}</button></article>
          <article className="panel security-card"><ShieldCheck size={21} /><div><strong>Secure by design</strong><p>Secret AI and payment keys remain inside Vercel Functions. Paid-plan fields cannot be edited from the browser.</p></div></article>
          <article className="panel account-identity"><div className="account-avatar">{(name || 'N')[0].toUpperCase()}</div><div><strong>{name || 'Nurj builder'}</strong><span>{user?.email ?? 'Guest workspace'}</span></div><BadgeCheck size={18} /></article>
        </div>
      </section>
    </div>
  );
}

function Upgrade({
  currentPlan,
  busy,
  onBack,
  onChoose,
}: {
  currentPlan: PlanKey;
  busy: PlanKey | null;
  onBack: () => void;
  onChoose: (plan: 'builder' | 'operator') => void;
}) {
  return (
    <main className="focus-shell upgrade-shell">
      <div className="focus-top"><Brand /><button className="button button-ghost button-small" onClick={onBack}><ArrowLeft size={15} /> Back</button></div>
      <section className="upgrade-heading"><span className="eyebrow">NURJ ACCESS</span><h1>More movement. Less friction.</h1><p>Choose the level that matches how often Nurj needs to work alongside the business.</p></section>
      <section className="pricing-grid">
        <PlanCard name="Free" price="₦0" description="Test the operating system and build a daily execution habit." features={['5 prompt architectures daily', '3 prompt enhancements daily', 'Free stage playbooks', 'Local guest exploration']} active={currentPlan === 'free'} />
        <PlanCard name="Builder" price="₦10,000" suffix="30 days" description="For a founder actively building pipeline, offers and content." features={['Unlimited prompt studio', 'Unlimited enhancements', 'Complete stage playbook library', 'Saved intelligence history', 'Priority generation capacity']} featured active={currentPlan === 'builder'} busy={busy === 'builder'} onChoose={() => onChoose('builder')} />
        <PlanCard name="Operator" price="₦25,000" suffix="30 days" description="For businesses using Nurj as a recurring commercial operating layer." features={['Everything in Builder', 'Operator-ready workflow foundation', 'Advanced business context profile', 'Early access to future intelligence tools', 'Priority support channel']} active={currentPlan === 'operator'} busy={busy === 'operator'} onChoose={() => onChoose('operator')} />
      </section>
      <p className="pricing-note"><ShieldCheck size={14} /> Payments are verified server-side through Paystack. Each successful purchase grants 30 days of access; it is not presented as automatic renewal.</p>
    </main>
  );
}

function PlanCard({
  name,
  price,
  suffix,
  description,
  features,
  featured,
  active,
  busy,
  onChoose,
}: {
  name: string;
  price: string;
  suffix?: string;
  description: string;
  features: string[];
  featured?: boolean;
  active: boolean;
  busy?: boolean;
  onChoose?: () => void;
}) {
  return <article className={`pricing-card ${featured ? 'featured' : ''}`}>{featured && <span className="popular-badge">MOST USEFUL</span>}<div><span>{name}</span>{active && <small>Current</small>}</div><h2>{price}</h2>{suffix && <b>/ {suffix}</b>}<p>{description}</p><ul>{features.map((feature) => <li key={feature}><Check size={14} /> {feature}</li>)}</ul>{onChoose && <button className={`button ${featured ? 'button-primary' : 'button-secondary'}`} disabled={busy || active} onClick={onChoose}>{active ? 'Current plan' : busy ? 'Opening Paystack…' : `Choose ${name}`}<ArrowRight size={15} /></button>}</article>;
}

function UsagePill({ used, limit, label }: { used: number; limit: number | null; label: string }) {
  return <div className="usage-pill"><span>{used}/{limit ?? '∞'}</span><div><strong>{label}</strong><small>{limit === null ? 'Unlimited access' : `${Math.max(0, limit - used)} remaining`}</small></div></div>;
}

function CopyButton({ text, notify, primary = false }: { text: string; notify: (message: string) => void; primary?: boolean }) {
  return <button className={primary ? 'button button-primary' : 'copy-button'} onClick={() => { void navigator.clipboard.writeText(text); notify('Prompt copied.'); }}><Copy size={14} /> Copy prompt</button>;
}

function IntelligenceLoader() {
  return <div className="intelligence-loader"><div className="loader-orbit"><Sparkles size={20} /></div><strong>Nurj is structuring the intelligence.</strong><p>Role · Context · Format · Constraint · Next action</p><div className="loader-lines"><i /><i /><i /><i /></div></div>;
}

function Toast({ message }: { message: string }) {
  return <motion.div className="toast" initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }}><Check size={15} /> {message}</motion.div>;
}

function LoadingScreen() {
  return <main className="loading-screen"><Ambient /><Brand /><div className="loader-orbit"><Sparkles size={20} /></div><p>Loading your business intelligence…</p></main>;
}

export default App;
