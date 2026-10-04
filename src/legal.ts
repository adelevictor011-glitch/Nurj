// Terms, Privacy and Refund policy text (roadmap feature 20).
//
// PROVISIONAL: adapted from the founder drafts and corrected to match how
// Nurj actually works today (one-time 30-day passes, no auto-renewal, no
// analytics cookies). Have a Nigerian lawyer review before relying on it.
// Bump LEGAL_VERSION whenever the text changes materially: signed-in users
// are asked to accept the new version once.

export const LEGAL_VERSION = '2026-10-04';
export const LEGAL_UPDATED = '4 October 2026';

// TODO(founder): confirm these mailboxes exist before merging.
export const SUPPORT_EMAIL = 'support@nurjai.com';
export const PRIVACY_EMAIL = 'privacy@nurjai.com';

const COMPANY = 'Made by Youni Ltd. (RC 9411546)';

export type LegalKey = 'terms' | 'privacy' | 'refunds';

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_PATHS: Record<string, LegalKey> = {
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/refunds': 'refunds',
};

export function legalFromPath(pathname: string): LegalKey | null {
  return LEGAL_PATHS[pathname.replace(/\/+$/, '') || '/'] ?? null;
}

export const LEGAL_DOCUMENTS: Record<LegalKey, LegalDocument> = {
  terms: {
    title: 'Terms of Use',
    intro: `These Terms govern your use of Nurj, operated by ${COMPANY} in Lagos, Nigeria ("Nurj", "we", "us").`,
    sections: [
      { heading: '1. Acceptance', body: [
        'By creating an account or using Nurj you agree to these Terms and to our Privacy Policy. If you do not agree, do not use Nurj. If you use Nurj for a business, you confirm you can bind that business.',
      ] },
      { heading: '2. What Nurj is', body: [
        'Nurj is an AI-assisted tool that helps you find your business stage and write, improve and run prompts for your business.',
        'Nurj produces AI-generated suggestions, not professional advice. It is not legal, financial, tax, medical or investment advice. Outputs can be wrong or incomplete; you decide how to use them.',
      ] },
      { heading: '3. Eligibility', body: ['You must be at least 18 and able to form a binding contract.'] },
      { heading: '4. Your account', body: [
        `You sign in with Google. You are responsible for activity under your account. Tell us at ${SUPPORT_EMAIL} about any unauthorised use. We may suspend accounts that break these Terms.`,
      ] },
      { heading: '5. Acceptable use', body: [
        'Do not: break the law or infringe others\' rights; create unlawful, harmful, deceptive or infringing content; try to break, overload, scrape or bypass the limits of Nurj; resell Nurj without permission; or submit other people\'s personal data without a lawful basis.',
      ] },
      { heading: '6. Your content and outputs', body: [
        'You keep your rights in what you submit. Subject to these Terms and our AI providers\' terms, you may use the outputs Nurj generates for you, including commercially. Outputs may resemble those given to other users and are not guaranteed to be original; check them before you publish.',
      ] },
      { heading: '7. Our property', body: ['The Nurj software, design, guides, templates and brand belong to Made by Youni Ltd. These Terms do not transfer ownership of them to you.'] },
      { heading: '8. Third-party services', body: [
        'Nurj relies on Google (sign-in), Supabase (database), Vercel (hosting), Groq (AI processing), Paystack (payments) and Resend (email). Their terms may also apply, and we are not responsible for their outages.',
      ] },
      { heading: '9. Plans, payments and refunds', body: [
        'Paid plans are bought through Paystack at the prices shown in the app. Each payment gives 30 days of access and does not renew automatically.',
        'You can get a full refund within 7 days of a payment, once per account, from Account settings. See the Refund Policy for details. Price changes do not affect access you have already paid for.',
      ] },
      { heading: '10. Fair use and daily limits', body: [
        'Free accounts have daily limits shown in the app. Paid plans have a generous daily fair-use ceiling to prevent abuse. To protect the service, AI features may be limited for free and guest users when total demand is very high.',
      ] },
      { heading: '11. Data protection', body: [
        'We handle personal data as set out in our Privacy Policy and the Nigeria Data Protection Act 2023. You can download or delete your data from Account settings at any time.',
      ] },
      { heading: '12. Disclaimers', body: ['Nurj is provided "as is" and "as available", without warranties, to the fullest extent the law allows. We do not promise it will be uninterrupted or error-free.'] },
      { heading: '13. Limitation of liability', body: [
        'To the fullest extent the law allows, we are not liable for indirect or consequential losses, or for lost profits, revenue, data or goodwill. Our total liability for any claim is limited to the greater of what you paid us in the 3 months before the claim or ₦10,000.',
      ] },
      { heading: '14. Termination', body: ['You can stop using Nurj and delete your account at any time. We may suspend or end access for breach of these Terms or legal reasons, with notice where practical.'] },
      { heading: '15. Changes', body: ['We may update these Terms. For material changes we will tell you in the app and ask you to accept the new version.'] },
      { heading: '16. Governing law', body: ['These Terms are governed by the laws of the Federal Republic of Nigeria, and disputes go to the courts of Lagos State.'] },
      { heading: '17. Contact', body: [`Questions about these Terms: ${SUPPORT_EMAIL}.`] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: `${COMPANY} is the data controller for the personal data described here. We follow the Nigeria Data Protection Act 2023 (NDPA).`,
    sections: [
      { heading: '1. What we collect', body: [
        'Account data from Google sign-in: your name, email address and profile photo. We never receive your Google password, emails, Drive or contacts.',
        'Business profile: your business description, target audience and stage.',
        'Prompt content: the goals, task context, mentors or frameworks and text you submit, the outputs produced, saved items and outcome feedback.',
        'Usage records: daily usage counts and which AI model ran with its token counts, for limits and cost control.',
        'Guests: a hashed (never raw) version of your IP address, to enforce the free preview limit.',
        'Payments: Paystack processes your card. We keep the transaction reference, plan, amount and status. We never see or store full card details.',
      ] },
      { heading: '2. Why we use it', body: [
        'To provide Nurj: your account, prompts and history (lawful basis: contract).',
        'To enforce limits and prevent abuse (lawful basis: legitimate interest).',
        'To take payments and process refunds (lawful basis: contract and legal obligation).',
        'To send service emails, such as plan expiry reminders (lawful basis: contract and legitimate interest).',
        'To improve Nurj using aggregated, anonymised statistics (lawful basis: legitimate interest).',
      ] },
      { heading: '3. AI processing', body: [
        'Your prompt inputs and outputs are sent to Groq, our AI provider, to produce results. Only submit what you are comfortable having processed this way, and do not submit other people\'s personal data without a lawful basis.',
      ] },
      { heading: '4. Who we share with', body: [
        'We do not sell personal data. We share it only with providers who run Nurj for us: Supabase (database and sign-in), Vercel (hosting), Groq (AI), Paystack (payments), Resend (email) and Google (sign-in). We may disclose data where the law requires.',
      ] },
      { heading: '5. International transfers', body: ['Some providers process data outside Nigeria, for example in the US or EU. We rely on the transfer safeguards the NDPA allows.'] },
      { heading: '6. How long we keep it', body: [
        'We keep your data while your account exists. When you delete your account, your profile, prompts, history, saved items and usage records are deleted. Payment records are kept without your name or email for as long as tax and accounting law requires.',
      ] },
      { heading: '7. Your rights', body: [
        'You can access, correct, download and delete your data. Edit your profile in Account settings; use "Download my data" for a copy and "Delete account" to erase it.',
        `For anything else, such as objecting to processing or withdrawing consent, email ${PRIVACY_EMAIL}. You can also complain to the Nigeria Data Protection Commission (NDPC).`,
      ] },
      { heading: '8. Security', body: ['We use access controls, encryption in transit, row-level database security, server-side secrets and hashing of guest identifiers. No system is perfectly secure, but we act quickly if something goes wrong.'] },
      { heading: '9. Children', body: [`Nurj is not for anyone under 18. If you believe a child has used Nurj, email ${PRIVACY_EMAIL} and we will remove the data.`] },
      { heading: '10. Cookies and storage', body: ['We use only essential browser storage to keep you signed in and remember your settings. We do not use advertising or analytics cookies.'] },
      { heading: '11. Changes', body: ['We will tell you in the app about material changes, with a new date at the top of this page.'] },
      { heading: '12. Contact', body: [`Privacy requests: ${PRIVACY_EMAIL}. General support: ${SUPPORT_EMAIL}.`] },
    ],
  },
  refunds: {
    title: 'Refund Policy',
    intro: 'Nurj offers a 7-day money-back guarantee on paid plans.',
    sections: [
      { heading: '1. Who can get a refund', body: [
        'Any payment for a Nurj plan or add-on can be refunded in full if you ask within 7 days of paying.',
        'Each account can use the self-serve refund once. After that, email us and we will review the request.',
      ] },
      { heading: '2. How to ask', body: [
        `Open Account settings and press "Request refund". No reason is needed, though one helps us improve. If the button is not shown, email ${SUPPORT_EMAIL} with your payment reference.`,
      ] },
      { heading: '3. What happens next', body: [
        'The refund goes back to the card or account you paid with through Paystack. Banks usually take 5 to 10 working days to show it.',
        'The 30 days that payment added are removed from your plan straight away. If no paid time remains, your account returns to the free plan. Your prompts, history and saved items stay.',
      ] },
      { heading: '4. Contact', body: [`Refund questions: ${SUPPORT_EMAIL}.`] },
    ],
  },
};
