import type { GuideBlock } from './types';

/**
 * Playbook bodies, keyed by item title.
 *
 * Before this file existed, `Guides` rendered 24 titles with read-time
 * estimates for articles that were never written, and the item buttons had no
 * onClick. "Complete stage playbook library" was a Builder feature that
 * resolved to nothing.
 */
export const GUIDE_CONTENT: Record<string, GuideBlock[]> = {
  // ── VALIDATION ───────────────────────────────────────────────────────────
  'The five-question idea filter': [
    { kind: 'text', body: 'Most ideas die from being interesting rather than being wrong. This filter is designed to kill an idea in twenty minutes so you do not spend six months finding out slowly.' },
    { kind: 'steps', heading: 'Run these in order', items: [
      'Who exactly loses money, time or standing if this problem stays unsolved? If you cannot name a person, you have a topic, not a business.',
      'What are they doing about it today? Every real problem already has an ugly workaround — a spreadsheet, a nephew, a WhatsApp group. If there is no workaround, there is probably no pain.',
      'How often does the pain happen? Weekly pain builds a business. Annual pain builds a project.',
      'Can you reach fifty of these people in the next fourteen days without paying for ads? Trade groups, estate WhatsApp groups, market associations, a supplier who already sells to them.',
      'What is the smallest thing you could charge for next week? Not the vision — the first invoice.',
    ] },
    { kind: 'callout', body: 'If you answer three or fewer with specifics, stop. The idea is not disqualified, but you do not yet know enough to spend money on it.' },
    { kind: 'text', body: 'The trap to avoid: answering question one with a demographic. "Young professionals in Lagos" is not a buyer. "Salon owners in Surulere who turn away walk-ins because they cannot track bookings" is a buyer, because you can go and find eleven of them this week.' },
  ],
  'Define one buyer, not a market': [
    { kind: 'text', body: 'A market is something you describe in a pitch deck. A buyer is someone you can message tonight. Until you have the second one, outreach stays vague and every message you write sounds like every other message they ignore.' },
    { kind: 'steps', heading: 'Narrow in three passes', items: [
      'Person: their role and their constraint, not their age bracket. "Owner-operator with two staff" beats "SME".',
      'Moment: the specific trigger that makes the problem urgent this week. Restock day. Month-end reconciliation. The day a rider disappears with goods.',
      'Consequence: what it costs them when it goes wrong, in naira or in reputation. If you cannot state this, you cannot price.',
    ] },
    { kind: 'text', body: 'Write the result as one sentence and put it where you will see it: "I help [person] who [moment] stop [consequence]." If the sentence needs a comma-separated list to feel complete, you have not narrowed enough.' },
    { kind: 'callout', body: 'Narrowing feels like shrinking the opportunity. It is the opposite — it is the only thing that makes cold outreach land, because the reader recognises themselves in the first line.' },
  ],
  'Praise versus purchase intent': [
    { kind: 'text', body: 'Nigerians are generous conversationalists. People will tell you your idea is beautiful, that God will bless it, that they will definitely patronise you. Almost none of that is data.' },
    { kind: 'list', heading: 'Praise — costs them nothing', items: [
      '"This is a good idea, well done."',
      '"I would definitely use something like this."',
      '"Send me the details, let me see."',
      '"When you launch, tell me."',
    ] },
    { kind: 'list', heading: 'Commitment — costs them something', items: [
      'Money, even a small deposit.',
      'Time on their calendar, scheduled, not "sometime".',
      'Reputation — a referral to a named person, with the intro sent while you are there.',
      'Access — they show you their actual records, prices or supplier list.',
    ] },
    { kind: 'text', body: 'After every conversation, write one line: what did this person actually give up? If the answer is nothing, the conversation was pleasant and uninformative. Three praise conversations mean nothing. One person transferring ₦5,000 before you have built anything means a great deal.' },
    { kind: 'callout', body: 'The strongest signal in Nigerian small business is unprompted repeat contact. If they message you first, a second time, without you chasing — that is real.' },
  ],
  'Book ten interviews in seven days': [
    { kind: 'text', body: 'Ten conversations is enough to hear the same sentence three times, which is the point at which you stop guessing. The barrier is never willingness — people enjoy talking about their work. The barrier is a vague ask.' },
    { kind: 'steps', heading: 'The seven-day sequence', items: [
      'Day 1: list thirty names. Warm contacts, second-degree intros, people whose shops you pass, members of trade groups you are already in.',
      'Day 1–2: message fifteen. Ask for fifteen minutes, name the topic, and be explicit that you are not selling.',
      'Day 3: go physical. Three shops or offices, mid-morning on a weekday when traffic is low. In-person conversion beats DMs by a distance.',
      'Day 4–5: follow up once with anyone who read and did not reply. Once. Not three times.',
      'Day 6–7: run the conversations you booked and write notes within an hour of each.',
    ] },
    { kind: 'callout', heading: 'A message that works', body: '"Good afternoon ma. I am researching how [specific business type] handle [specific problem] — I am not selling anything. Could I ask you four questions for fifteen minutes this week? Any day that suits you."' },
    { kind: 'text', body: 'Expect roughly a third to say yes. Fifteen messages plus three walk-ins reliably produces ten conversations. If your yes-rate is far below that, your message is too long or too vague about what you want.' },
  ],
  'Questions that reveal real pain': [
    { kind: 'text', body: 'The wrong question is hypothetical: "Would you use an app that tracks your stock?" Everyone says yes. The right question is historical: it asks what they actually did, when, and what it cost.' },
    { kind: 'list', heading: 'Replace hypothetical with behavioural', items: [
      'Instead of "would you pay for this" — "What did you spend money on last month to deal with this?"',
      'Instead of "is this a problem" — "Walk me through the last time this went wrong. What happened that day?"',
      'Instead of "what features do you want" — "What did you try before? Why did you stop?"',
      'Instead of "how much would you pay" — "What does an hour of this problem cost you?"',
    ] },
    { kind: 'text', body: 'Then stay quiet. The most valuable information in these conversations arrives in the silence after you stop talking. Count to five before filling it.' },
    { kind: 'callout', body: 'Never pitch during a discovery conversation. The moment you describe your solution, the person switches from informant to polite audience, and everything after that is contaminated.' },
    { kind: 'text', body: 'Record the exact words people use. Not your summary of them — their phrasing. That phrasing becomes your outreach copy later, and it will outperform anything you write yourself.' },
  ],
  'Turn interviews into a pilot': [
    { kind: 'text', body: 'A pilot is not a beta and not a favour. It is the smallest paid version of the thing, delivered to a real buyer, with a defined end date.' },
    { kind: 'steps', heading: 'From notes to pilot', items: [
      'Find the sentence that repeated. Across ten conversations, one complaint will appear at least four times, in similar language. That is your pilot.',
      'Scope it to one outcome deliverable in two weeks. Not a platform. One outcome.',
      'Price it low but not free. Free removes the only signal you are trying to buy.',
      'Name the end date and the success measure before you start. "By the 20th, you will have X, and we will know it worked if Y."',
      'Sell it to three people from your interview list — the ones who gave you commitment, not praise.',
    ] },
    { kind: 'callout', body: 'Charging a small amount is not about revenue. It is the cheapest way to find out whether the problem is worth solving, and it changes how seriously the buyer treats the pilot.' },
    { kind: 'text', body: 'If nobody from your interview list will pay a reduced price for a narrow version, that is a finding, not a failure. It usually means you found a real annoyance rather than a real cost. Go back to the notes and look for the one with a naira figure attached.' },
  ],

  // ── LAUNCH ───────────────────────────────────────────────────────────────
  'Your first ten clients': [
    { kind: 'text', body: 'The first ten almost never come from strangers on the internet. They come from people who already have a reason to trust you, and from the people those people know. Build the rhythm before you build the funnel.' },
    { kind: 'steps', heading: 'The weekly rhythm', items: [
      'Monday: five warm messages. People who already know you. Not a pitch — a specific, relevant observation plus an offer.',
      'Tuesday: five second-degree asks. "Do you know anyone who [specific situation]?" Named referrals beat broadcast posts.',
      'Wednesday: five cold, highly researched messages. Ten minutes of research each. Quality over volume, always.',
      'Thursday: follow up on everything from last week that went quiet.',
      'Friday: one piece of public proof — a result, a lesson, a short breakdown of how you solved something.',
    ] },
    { kind: 'text', body: 'Twenty conversations a week, sustained for six weeks, reliably produces the first few clients for most service businesses. The failure mode is not low conversion — it is stopping in week two because nothing happened in week one.' },
    { kind: 'callout', body: 'Track conversations started, not clients closed. The first number is under your control; the second is a lagging consequence of it.' },
  ],
  'Cold messages that earn replies': [
    { kind: 'text', body: 'Cold outreach fails for one reason: it is obviously about you. Four short parts fix that, and the whole message should fit on a phone screen without scrolling.' },
    { kind: 'steps', heading: 'The four parts', items: [
      'Observation — something specific and true about their business. It must be impossible to copy-paste to anyone else.',
      'Relevance — why that observation connects to something you do.',
      'Proof — one concrete result, with a number or a named situation. One line only.',
      'Easy next step — a small, low-commitment ask. Not "let us jump on a call."',
    ] },
    { kind: 'callout', heading: 'Example', body: '"Good morning — I noticed your Instagram shop takes orders in DMs but there is no price list in your highlights, so you are probably answering \'how much\' twenty times a day. I build simple order pages for fashion vendors; the last one cut a client\'s DM back-and-forth by about half. Would it help if I sent a one-page mockup for yours? No charge, no obligation."' },
    { kind: 'text', body: 'Never open with "I hope this message finds you well." Never send a voice note first. Never attach a deck to a first message. Every one of those signals a broadcast, and the reader files it accordingly.' },
  ],
  'Follow up without chasing': [
    { kind: 'text', body: 'Most deals are lost in silence rather than in rejection. But there is a real difference between persistence and pestering, and it is mostly about whether each follow-up carries new value.' },
    { kind: 'steps', heading: 'Three touches, then stop', items: [
      'Touch one, three days later: add something. A relevant example, a link, a thought about their specific situation. Do not ask "did you see my message?"',
      'Touch two, one week after that: change the channel. If you emailed, try WhatsApp. If you DM\'d, try a call.',
      'Touch three, two weeks after that: the close-the-loop message. "I am assuming the timing is not right — I will stop here. If it changes, my line is open."',
    ] },
    { kind: 'callout', body: 'The third message gets more replies than the first two combined. Removing pressure is what makes people respond.' },
    { kind: 'text', body: 'After touch three, stop and move the contact to a quarterly list. Reaching out once every three months with something genuinely useful keeps the door open for years. Messaging weekly closes it permanently.' },
  ],
  'Price the outcome': [
    { kind: 'text', body: 'Hourly pricing punishes you for getting better and forces the client to audit your time instead of your result. Move to packages as early as you can survive it.' },
    { kind: 'steps', heading: 'Building three tiers', items: [
      'Start from the outcome the buyer wants, then work backwards to what it is worth to them. What does the problem cost per month?',
      'Build the middle tier first — this is the one you actually want to sell.',
      'Build a lower tier that is genuinely useful but visibly narrower. It exists to make the middle look complete, and to catch buyers who cannot yet afford more.',
      'Build a higher tier with a small number of high-value additions. Some people will take it, which is a free lesson in what your market values.',
      'Name the tiers after outcomes, not sizes. "Order page live in seven days" beats "Basic".',
    ] },
    { kind: 'callout', body: 'Publish the starting price. In the Nigerian market, hiding prices reads as "expensive and about to negotiate", and it filters out the serious buyers along with the time-wasters.' },
    { kind: 'text', body: 'Expect discomfort the first three times you say the number out loud. Say it, then stop talking. Do not add "but we can discuss" before they have responded.' },
  ],
  'The 20-minute proposal': [
    { kind: 'text', body: 'Long proposals do not win work; they delay decisions. If you cannot fit it on one page, the scope is not clear enough yet.' },
    { kind: 'steps', heading: 'One page, six blocks', items: [
      'The situation, in their words. Quote them. This alone wins more work than anything else on the page.',
      'The outcome, stated as a result rather than a list of activities.',
      'What is included, in three to five bullets.',
      'What is explicitly not included. This prevents the scope argument three weeks in.',
      'Timeline with two dates: start and delivery.',
      'Price, payment terms, and exactly what happens next.',
    ] },
    { kind: 'callout', body: 'Send it as a PDF, not a document that can be edited. Send it within twenty-four hours of the conversation, while the problem is still emotionally live for them.' },
    { kind: 'text', body: 'End with a single clear instruction: "If this looks right, reply \'approved\' and I will send the invoice today." Ambiguous endings produce ambiguous replies.' },
  ],
  'Deposits and payment terms': [
    { kind: 'text', body: 'Cash flow kills more small Nigerian businesses than competition does. Payment terms are not admin — they are the part of the deal that determines whether you survive delivery.' },
    { kind: 'list', heading: 'Non-negotiables', items: [
      'Take a deposit before any work begins. Fifty percent is standard for project work; below thirty percent you are financing the client.',
      'Put the account details in the proposal, not in a later message. Friction between decision and payment loses deals.',
      'State a specific date for the balance, not "on completion" — completion is arguable, a date is not.',
      'Say what happens if payment is late, once, calmly, in writing. Usually: work pauses.',
      'Issue a proper invoice with your business name and a reference. It signals that you are a business, which changes how you get treated.',
    ] },
    { kind: 'callout', body: 'A client who will not pay a deposit is showing you exactly how the final payment will go. Take the information seriously.' },
    { kind: 'text', body: 'Wording that works without aggression: "To lock the start date I take 50% upfront, with the balance due on delivery day. I will send the invoice now and we can begin as soon as it clears."' },
  ],

  // ── SCALING ──────────────────────────────────────────────────────────────
  'Raise prices without drama': [
    { kind: 'text', body: 'There are two separate problems here and conflating them causes most of the pain: what you charge new clients, and what you do about existing ones. Solve them separately.' },
    { kind: 'steps', heading: 'New clients', items: [
      'Raise the number on the next proposal you send. No announcement, no explanation, no apology.',
      'Hold it for five conversations before judging. One rejection is noise.',
      'If four of five say yes immediately, the price is still too low.',
    ] },
    { kind: 'steps', heading: 'Existing clients', items: [
      'Give at least thirty days notice, in writing, to each client individually. Never as a broadcast.',
      'State the new rate and the date it starts. Do not justify at length — one sentence of reason is enough.',
      'Offer to honour the old rate for work already scoped. This costs little and preserves the relationship.',
      'Expect to lose one. Budget for it emotionally before you send the messages.',
    ] },
    { kind: 'callout', heading: 'Script', body: '"From 1 [Month], my rate for this work moves to ₦X. Anything already agreed stays at the current rate. I have valued working with you and I hope we continue — I wanted to give you plenty of notice either way."' },
  ],
  'Package outcomes, not hours': [
    { kind: 'text', body: 'The purpose of a three-tier structure is not to offer choice. It is to change the question in the buyer\'s head from "should I buy this?" to "which one should I buy?"' },
    { kind: 'steps', heading: 'Designing the middle', items: [
      'The middle tier should contain everything a typical buyer actually needs. Nothing missing, nothing padded.',
      'The lower tier should be honestly narrower — a real option for a smaller buyer, not a crippled version designed to insult.',
      'The upper tier should be roughly two to three times the middle, with additions that only some buyers value. Speed, access, scope, or ongoing support.',
      'Price the middle at what the outcome is worth, then set the others around it. Never build up from cost.',
    ] },
    { kind: 'callout', body: 'If almost everyone picks the cheapest tier, the middle is not compelling enough. If almost everyone picks the middle, the structure is working.' },
    { kind: 'text', body: 'Review the mix every quarter. The tier nobody buys is telling you something — either it is priced wrong or it solves a problem your market does not have.' },
  ],
  'Find the work only you should do': [
    { kind: 'text', body: 'Scaling stalls when the founder is the bottleneck for everything. The unlock is not working harder — it is being precise about which decisions genuinely require you.' },
    { kind: 'steps', heading: 'The audit', items: [
      'Log everything you do for one week, in fifteen-minute blocks. Do not tidy it up.',
      'Mark each entry: judgment, relationship, craft, or admin.',
      'Admin goes first — it is the cheapest to hand off and the least risky to get slightly wrong.',
      'Craft goes second, once you have documented how you do it.',
      'Relationship and judgment stay with you the longest, and some of it stays forever.',
    ] },
    { kind: 'callout', body: 'The common mistake is delegating the work you dislike rather than the work that is genuinely low-leverage. Those are not the same list.' },
    { kind: 'text', body: 'Start with one task, not five. Document it, hand it over, accept that the first three attempts will be worse than yours, and correct rather than reclaim. Reclaiming teaches the person that you will always take it back.' },
  ],
  'Document one process in one hour': [
    { kind: 'text', body: 'Most process documentation fails because it is attempted at the wrong scale. You do not need a manual. You need one page for the one thing that breaks most often.' },
    { kind: 'steps', heading: 'The one-hour method', items: [
      'Pick the process that has gone wrong twice in the last month.',
      'Do it once, normally, while recording your screen or narrating a voice note as you go.',
      'Write the steps from the recording — not from memory. Memory skips the steps you do automatically, and those are exactly the ones a new person gets wrong.',
      'Add the three failure points and what to do at each.',
      'Have someone else follow it once without your help. Fix whatever confused them. Stop there.',
    ] },
    { kind: 'callout', body: 'A one-page SOP that people actually use beats a twenty-page manual that lives in a folder nobody opens.' },
    { kind: 'text', body: 'Store it somewhere the team already looks — a pinned WhatsApp message, a shared doc, a printed sheet on the wall. The best documentation is the one nearest to the work.' },
  ],
  'Projects into retainers': [
    { kind: 'text', body: 'Project income resets to zero every month and forces you to sell continuously. Retainers convert delivery into a base you can plan around, hire against, and eventually step back from.' },
    { kind: 'steps', heading: 'The conversion', items: [
      'Only propose it after a successful delivery, while the result is visible and recent.',
      'Anchor on the ongoing problem, not the ongoing work. "This will drift back within two months unless someone is watching it."',
      'Scope it tightly — a specific set of things, a specific frequency, a specific reporting rhythm.',
      'Price it at roughly a third of the project value per month for a comparable scope, then adjust with evidence.',
      'Set a review date at three months. Reviews make clients more willing to start, not less.',
    ] },
    { kind: 'callout', heading: 'The ask', body: '"Now that this is live, the thing that usually degrades is [specific]. I can hold that for you at ₦X monthly — [three specific deliverables], reviewed together every quarter. Want me to put it in writing?"' },
    { kind: 'text', body: 'Two retainers that cover your fixed costs change your negotiating posture on every project that follows. That shift is worth more than the retainer revenue itself.' },
  ],
  'A content system that compounds': [
    { kind: 'text', body: 'The goal is not reach. It is that the right person arrives at a conversation already believing you know what you are doing. One post a week, sustained for a year, does this. Daily posting for three weeks does not.' },
    { kind: 'steps', heading: 'The weekly unit', items: [
      'Take one real thing from your week — a problem you solved, a mistake, a number that surprised you.',
      'State the situation in two lines, with enough specificity that a peer recognises it.',
      'State what you did and why, including the part where you were unsure.',
      'State the outcome, with a number if you have one.',
      'Stop. No call to action, no engagement bait.',
    ] },
    { kind: 'callout', body: 'Specificity is the entire strategy. "How to grow your business" reaches nobody. "Why I stopped taking bank transfers without a reference and what it cost me first" reaches exactly the person who has that problem.' },
    { kind: 'text', body: 'Track one metric only: inbound conversations that mention something you wrote. Likes are not the product.' },
  ],

  // ── EXIT ─────────────────────────────────────────────────────────────────
  'Calculate your six-month runway': [
    { kind: 'text', body: 'Runway is the number that converts leaving your job from a feeling into a decision. Most people guess it, guess low, and leave at the wrong time.' },
    { kind: 'steps', heading: 'The calculation', items: [
      'Personal burn: rent or its monthly equivalent, food, transport, data, family obligations, health, and the irregular costs you forget — car repairs, occasions, black-tax months. Add fifteen percent for the ones you did not list.',
      'Business burn: tools, subscriptions, data, transport to clients, any help you pay for.',
      'Add both. Multiply by six. That is your floor.',
      'Subtract confirmed recurring revenue that will continue after you leave. Not hoped-for revenue — signed.',
      'The remainder is what must be in the bank before you resign.',
    ] },
    { kind: 'callout', body: 'Six months is the minimum for most people, not the target. Nine months buys you the ability to say no to bad clients, which is what actually determines whether the business survives year one.' },
    { kind: 'text', body: 'Recalculate monthly. The number moves as your recurring revenue grows, and watching it move is the most motivating dashboard you will ever build.' },
  ],
  'The salary replacement model': [
    { kind: 'text', body: 'Work backwards from what you need, not forwards from what you hope. The arithmetic is unglamorous and it is the whole plan.' },
    { kind: 'steps', heading: 'Working backwards', items: [
      'Start with your current take-home pay, not your gross. That is the number your life is built on.',
      'Add what your employer covers that you will now cover yourself — pension, health, transport, any allowances.',
      'Add tax on your business income. Do not skip this step; it is where most projections quietly break.',
      'Divide by your average monthly value per client. That is how many clients you need.',
      'Divide by your close rate to get conversations required per month. That is your actual weekly target.',
    ] },
    { kind: 'callout', body: 'If the number of clients required is uncomfortably high, the answer is almost always pricing, not effort. Doubling your price halves the number of relationships you must maintain.' },
    { kind: 'text', body: 'Then apply the retention check: what percentage of clients stay past three months? Replacement is not real until the base is stable, because churn means you are running to stand still.' },
  ],
  'Never let one client own your future': [
    { kind: 'text', body: 'A single client at sixty percent of revenue is not a great client relationship. It is an employer with none of the protections, and it will shape every decision you make in ways you will not notice until it ends.' },
    { kind: 'steps', heading: 'The concentration rule', items: [
      'No single client above forty percent of monthly revenue. Above that, you are structurally unsafe.',
      'Calculate the ratio on the first of every month. It moves faster than you expect.',
      'When one client crosses the line, do not fire them — outsell the concentration. Add clients rather than subtracting revenue.',
      'Keep prospecting during your best months. The instinct to stop when busy is what creates the concentration in the first place.',
    ] },
    { kind: 'callout', body: 'The warning sign is behavioural before it is financial: you start accepting scope changes you would refuse from anyone else. That is the concentration talking.' },
    { kind: 'text', body: 'If you are already concentrated, be honest about it and set a target date to get under forty percent. Naming the risk removes most of its power over your decisions.' },
  ],
  'Your 90-day exit countdown': [
    { kind: 'text', body: 'An exit date without weekly milestones is a wish. Ninety days is long enough to build a base and short enough to stay urgent.' },
    { kind: 'steps', heading: 'Three phases', items: [
      'Days 1–30, prove the engine: hit your weekly conversation target every week without exception. Do not optimise anything yet — establish that you can generate pipeline while employed.',
      'Days 31–60, build the base: convert to recurring where possible, raise prices on new work, and get runway into the account. Target sixty percent of salary replaced by day sixty.',
      'Days 61–90, de-risk and prepare: document your processes, confirm your runway number, write the resignation, and line up the first thirty days of work post-exit.',
    ] },
    { kind: 'callout', body: 'Two checkpoints are non-negotiable. Day 45: is recurring revenue growing month on month? Day 75: is the runway in the account, not projected? If either answer is no, move the date. Moving a date is not failure — leaving without a base is.' },
    { kind: 'text', body: 'Tell exactly one person the date. Accountability without an audience. A public announcement creates pressure to leave on schedule even when the numbers say otherwise.' },
  ],
  'Resign without burning the bridge': [
    { kind: 'text', body: 'Your employer is the single most likely first client of your new business, and the people you work with now will be referring you for the next decade. The exit is a commercial act, not just a personal one.' },
    { kind: 'steps', heading: 'How to leave well', items: [
      'Tell your direct manager first, in person or on a call, before anyone else hears it. This matters more than the notice period.',
      'Give full notice, and more if you can afford it. The extra weeks cost you little and buy you a great deal.',
      'Do not explain that you are leaving to build something better. "I am moving on to work on my own thing" is complete.',
      'Document your work and hand over properly. This is what people remember two years later.',
      'Never discuss grievances on the way out, however justified. There is no version of that conversation that helps you.',
    ] },
    { kind: 'callout', body: 'Wait at least a month before approaching your former employer as a client. Approaching immediately makes the resignation look like a sales tactic in retrospect.' },
    { kind: 'text', body: 'Keep the relationships warm afterwards. A short message twice a year to former colleagues, with something useful in it, is the highest-return networking available to you.' },
  ],
  'The first 30 days full-time': [
    { kind: 'text', body: 'The first month full-time is dangerous precisely because it feels free. Without the structure your job imposed, most people become reactive and busy, and produce less than they did while employed.' },
    { kind: 'steps', heading: 'Build structure before freedom', items: [
      'Keep working hours. Start and stop at fixed times. This is for the people around you as much as for you.',
      'Protect the first two hours for sales. Not admin, not building, not tidying the website. Pipeline first, every single day.',
      'Set a weekly review at a fixed time: conversations started, proposals sent, revenue closed, runway remaining.',
      'Leave the house at least three times a week. Isolation degrades judgment faster than anything else at this stage.',
      'Do not rebuild your brand, your logo or your site in month one. That is procrastination wearing a productive costume.',
    ] },
    { kind: 'callout', body: 'The most common month-one failure is spending it preparing to work rather than working. If you have not sent a proposal by day seven, that is what is happening.' },
    { kind: 'text', body: 'Expect a confidence dip somewhere around week three, usually after the first rejection with no salary behind it. It is normal, it passes, and the only reliable cure is another conversation booked.' },
  ],
};
