import type { GoalDefinition, GuideSection, QuizQuestion, StageDefinition, StageKey } from './types';

export const QUIZ: QuizQuestion[] = [
  {
    question: 'How far has the business moved beyond your head?',
    helper: 'Choose the answer that describes reality today, not the plan.',
    options: [
      { label: 'It is still mostly an idea', value: 0 },
      { label: 'I have started, but nobody has paid', value: 1 },
      { label: 'People pay, but revenue is unpredictable', value: 2 },
      { label: 'Revenue is consistent and I need leverage', value: 3 },
    ],
  },
  {
    question: 'What does a normal month look like financially?',
    helper: 'This helps Nurj separate motivation problems from business-model problems.',
    options: [
      { label: '₦0 — I am still proving demand', value: 0 },
      { label: 'Under ₦50,000', value: 1 },
      { label: '₦50,000 – ₦300,000', value: 2 },
      { label: 'Above ₦300,000', value: 3 },
    ],
  },
  {
    question: 'What outcome would change the next 90 days?',
    helper: 'Pick the milestone that creates the most momentum.',
    options: [
      { label: 'Know whether the idea is worth pursuing', value: 0 },
      { label: 'Win my first paying customers', value: 1 },
      { label: 'Make income repeatable', value: 2 },
      { label: 'Build enough certainty to leave my job', value: 3 },
    ],
  },
  {
    question: 'Where does the engine break most often?',
    helper: 'The answer becomes the first constraint Nurj attacks.',
    options: [
      { label: 'I do not know what to test first', value: 0 },
      { label: 'I struggle to get serious buyers', value: 1 },
      { label: 'Delivery depends too much on me', value: 2 },
      { label: 'The risk of going full-time still feels high', value: 3 },
    ],
  },
  {
    question: 'How much focused time can you protect weekly?',
    helper: 'A realistic plan beats an ambitious plan you cannot execute.',
    options: [
      { label: 'Less than 5 hours', value: 0 },
      { label: '5–10 hours', value: 1 },
      { label: '10–20 hours', value: 2 },
      { label: 'More than 20 hours', value: 3 },
    ],
  },
];

export const STAGES: Record<StageKey, StageDefinition> = {
  validation: {
    key: 'validation',
    label: 'Validation',
    number: 1,
    eyebrow: 'Find the signal',
    description: 'Prove a painful problem exists before investing deeply in the solution.',
    signal: 'Conversations, commitments and pre-orders matter more than compliments.',
    firstMove: 'Book 5 problem interviews with potential customers.',
    metric: '5 interviews booked',
    actions: [
      'Write one sentence describing the customer and painful problem.',
      'Send five curiosity-led interview invitations.',
      'Record the exact words buyers use when describing the problem.',
    ],
  },
  launch: {
    key: 'launch',
    label: 'Launch',
    number: 2,
    eyebrow: 'Turn attention into money',
    description: 'Package the value clearly, ask for the sale and build a repeatable client pipeline.',
    signal: 'A simple offer sold consistently is more valuable than a perfect brand nobody buys.',
    firstMove: 'Send five highly specific outreach messages today.',
    metric: '5 quality outreaches',
    actions: [
      'Write your offer as one outcome, one audience and one price.',
      'Create a four-line outreach message built around a real observation.',
      'Set a follow-up date before every conversation ends.',
    ],
  },
  scaling: {
    key: 'scaling',
    label: 'Scaling',
    number: 3,
    eyebrow: 'Build leverage',
    description: 'Increase revenue without allowing workload and complexity to grow at the same speed.',
    signal: 'Pricing, systems and retention should do more work than longer hours.',
    firstMove: 'Turn your most repeated service into three outcome-based packages.',
    metric: '1 packaged offer',
    actions: [
      'Raise the price for every new client before changing old contracts.',
      'Document the delivery step that consumes the most founder time.',
      'Convert one successful project into a monthly retainer offer.',
    ],
  },
  exit: {
    key: 'exit',
    label: 'Exit 9–5',
    number: 4,
    eyebrow: 'Create certainty',
    description: 'Replace salary risk with runway, contracted revenue and a deliberate transition plan.',
    signal: 'Do not resign because you are tired. Resign because the numbers and pipeline agree.',
    firstMove: 'Calculate the exact monthly revenue and runway required to resign safely.',
    metric: 'Exit number calculated',
    actions: [
      'Calculate personal burn, business burn and a six-month safety buffer.',
      'Build a retainer offer that can replace at least 40% of salary.',
      'Set an exit date and work backwards into monthly milestones.',
    ],
  },
};

export const GOALS: GoalDefinition[] = [
  { id: 'cold-dm', label: 'Write a cold DM', description: 'Start a natural conversation with a specific prospect.', icon: 'MessageSquare' },
  { id: 'outreach-email', label: 'Create an outreach email', description: 'Earn a reply without sounding copied or desperate.', icon: 'Mail' },
  { id: 'service-offer', label: 'Build my service offer', description: 'Turn what you do into a clear commercial promise.', icon: 'Target' },
  { id: 'pricing', label: 'Price my offer', description: 'Create profitable naira-based packages and anchors.', icon: 'BadgeNaira' },
  { id: 'content-plan', label: 'Plan content that sells', description: 'Build a practical content engine around buyer problems.', icon: 'CalendarRange' },
  { id: 'proposal', label: 'Write a client proposal', description: 'Present the outcome, scope, timeline and price clearly.', icon: 'FileText' },
  { id: 'launch', label: 'Write a launch campaign', description: 'Create a focused launch announcement and call to action.', icon: 'Rocket' },
  { id: 'custom', label: 'Something specific', description: 'Describe the exact business task on your mind.', icon: 'Sparkles' },
];

export const GUIDES: Record<StageKey, GuideSection[]> = {
  validation: [
    {
      title: 'Signal before solution',
      items: [
        { title: 'The five-question idea filter', description: 'A fast way to decide whether an idea deserves six months of your life.', minutes: 7, free: true },
        { title: 'Define one buyer, not a market', description: 'Narrow the person, moment and pain until outreach becomes obvious.', minutes: 9, free: true },
        { title: 'Praise versus purchase intent', description: 'How to identify commitment signals hidden inside customer conversations.', minutes: 8 },
      ],
    },
    {
      title: 'Customer discovery',
      items: [
        { title: 'Book ten interviews in seven days', description: 'A practical WhatsApp, DM and in-person outreach sequence.', minutes: 11, free: true },
        { title: 'Questions that reveal real pain', description: 'Replace hypothetical questions with behaviour and consequence questions.', minutes: 10 },
        { title: 'Turn interviews into a pilot', description: 'Translate repeated language into one narrow paid experiment.', minutes: 12 },
      ],
    },
  ],
  launch: [
    {
      title: 'Offer and pipeline',
      items: [
        { title: 'Your first ten clients', description: 'Build a weekly outreach rhythm across warm contacts, DMs and referrals.', minutes: 12, free: true },
        { title: 'Cold messages that earn replies', description: 'Observation, relevance, proof and an easy next step.', minutes: 8, free: true },
        { title: 'Follow up without chasing', description: 'A three-touch sequence that keeps dignity and increases response rate.', minutes: 7 },
      ],
    },
    {
      title: 'Close professionally',
      items: [
        { title: 'Price the outcome', description: 'Move beyond hours and create three packages buyers can compare.', minutes: 11, free: true },
        { title: 'The 20-minute proposal', description: 'A concise proposal structure that reduces confusion and delay.', minutes: 9 },
        { title: 'Deposits and payment terms', description: 'Protect cash flow with clear Nigerian-market payment language.', minutes: 8 },
      ],
    },
  ],
  scaling: [
    {
      title: 'Leverage your best work',
      items: [
        { title: 'Raise prices without drama', description: 'A new-client pricing strategy and an existing-client communication script.', minutes: 9, free: true },
        { title: 'Package outcomes, not hours', description: 'Build a three-tier offer designed to make the middle option compelling.', minutes: 12, free: true },
        { title: 'Find the work only you should do', description: 'Separate founder judgment from tasks that can be systemised or delegated.', minutes: 10 },
      ],
    },
    {
      title: 'Build repeatability',
      items: [
        { title: 'Document one process in one hour', description: 'Create a useful SOP without turning your business into bureaucracy.', minutes: 10, free: true },
        { title: 'Projects into retainers', description: 'Turn successful delivery into recurring monthly value.', minutes: 9 },
        { title: 'A content system that compounds', description: 'Publish one insight each week that demonstrates commercial judgment.', minutes: 8 },
      ],
    },
  ],
  exit: [
    {
      title: 'Make the numbers agree',
      items: [
        { title: 'Calculate your six-month runway', description: 'Personal burn, business burn and the amount that creates decision freedom.', minutes: 10, free: true },
        { title: 'The salary replacement model', description: 'Work backwards from take-home pay into clients, pricing and retention.', minutes: 12, free: true },
        { title: 'Never let one client own your future', description: 'Use a concentration rule to reduce the risk of sudden revenue loss.', minutes: 8 },
      ],
    },
    {
      title: 'Design the transition',
      items: [
        { title: 'Your 90-day exit countdown', description: 'Turn an exit date into weekly commercial and operational milestones.', minutes: 13 },
        { title: 'Resign without burning the bridge', description: 'Protect reputation and leave room for your employer to become a client.', minutes: 7 },
        { title: 'The first 30 days full-time', description: 'Build structure before freedom turns into reactive work.', minutes: 9 },
      ],
    },
  ],
};
