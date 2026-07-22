# Fixes for Supabase Connection & Prompt Architecture

## Issue 2: Missing Null Check for Supabase Client in User Creation

**Problem:** When users complete the quiz (line 206-230 in `src/App.tsx`), the profile is saved to Supabase with `.upsert()`. However:
- If Supabase is not configured, `supabase` is `null`
- The condition `if (user && supabase)` prevents errors but silently skips database save
- Users don't get created in Supabase, so their profile syncs fail later

**Why users aren't created:**
1. User signs in → Supabase creates auth user ✅
2. User completes quiz → tries to save profile to `profiles` table ❌ (silently skipped if supabase is null)
3. Later, `syncStatus()` tries to fetch profile and fails
4. User gets stuck in auth limbo

**Fix for `src/App.tsx` line 206-230:**
```typescript
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
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: nextProfile.display_name,
        stage: stageKey,
        onboarding_complete: true,
        momentum_score: 24,
        created_at: new Date().toISOString(),  // ADD THIS - needed for initial insert
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error('Profile upsert error:', error);
        notify(`Could not save your profile: ${error.message}`);
        return; // Don't proceed if save fails
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save your profile.');
      return;
    }
  } else if (user && !supabase) {
    notify('Supabase is not configured. Your profile will not be saved.');
    // Still allow proceeding in demo mode
  }

  setScreen('result');
}
```

---

## Issue 3: OAuth Redirect URL Using String Quotes Instead of Backticks

**Problem:** Line 186 in `src/App.tsx`
```typescript
redirectTo: '${window.location.origin}/auth/callback', // WRONG - literal string
```
This sends the literal string `"${window.location.origin}/auth/callback"` instead of interpolating the actual origin.

**Result:** OAuth callback fails because Supabase redirects to a malformed URL.

**Fix for `src/App.tsx` line 178-189:**
```typescript
async function signIn() {
  if (!supabase) {
    notify('Add your Supabase environment variables to enable Google sign-in.');
    return;
  }
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { 
        redirectTo: `${window.location.origin}/auth/callback`,  // Use backticks, not quotes
      },
    });
    if (error) {
      console.error('OAuth error:', error);
      notify(error.message);
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Sign-in failed.');
  }
}
```

---

## Issue 4: Insufficient Supabase URL Validation

**Problem:** Line 7 in `src/lib/supabase.ts`
```typescript
url && publishableKey && !url.includes('YOUR_PROJECT')
```

This only checks for the `YOUR_PROJECT` placeholder. Invalid URLs still pass:
- `https://invalid.com` ✅ passes (wrong!)
- `http://myproject.supabase.co` ✅ passes (wrong protocol!)
- Missing protocol altogether ✅ passes

**Result:** Client creates invalid Supabase client that fails silently.

**Fix for `src/lib/supabase.ts`:**
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Must be HTTPS, must be a supabase.co domain
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

export const supabase: SupabaseClient | null =
  url && publishableKey && isValidSupabaseUrl(url)
    ? createClient(url, publishableKey, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isSupabaseConfigured = Boolean(supabase);
```

---

## Why Prompts Don't Architect Well

**Problem:** The OpenAI integration uses `responses.create()` API, but the instructions and schema don't include enough Nigerian business context.

**Current issues in `api/_lib/openai.ts`:**
1. Instructions are truncated (line 57 shows `[...]`)
2. Schema is too permissive (allows any string)
3. No validation that output actually follows the intended structure

**Current instructions (partial) in `api/generate.ts` line 55-59:**
```typescript
instructions: `You are Nurj, a commercially rigorous prompt architect for Nigerian founders...
Build prompts with a precise expert role, concrete business context, exact objective, useful output format, quality constraints, Nigerian market context only when relevant, and one immediate execu[...]
```

**Fix for `api/_lib/openai.ts` — better structure and validation:**
```typescript
import OpenAI from 'openai';
import { env } from './env';

let client: OpenAI | null = null;

function openai() {
  client ??= new OpenAI({ apiKey: env.openaiApiKey });
  return client;
}

export async function createStructuredResponse<T>(params: {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const response = await openai().responses.create({
    model: env.openaiModel,
    instructions: params.instructions,
    input: params.input,
    text: {
      format: {
        type: 'json_schema',
        name: params.name,
        strict: true,
        schema: params.schema,
      },
    },
  });

  if (!response.output_text) {
    throw new Error('The AI returned an empty response.');
  }

  try {
    const parsed = JSON.parse(response.output_text) as T;
    
    // Validate required fields exist
    const schemaRequired = (params.schema as { required?: string[] }).required || [];
    for (const field of schemaRequired) {
      if (!(field in parsed)) {
        throw new Error(`Missing required field in response: ${field}`);
      }
    }
    
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('The AI response was not valid JSON.');
    }
    throw error;
  }
}
```

---

## Why Prompt Quality Is Low

**Better instructions for `api/generate.ts`:**

Replace the current truncated instructions with:

```typescript
const result = await createStructuredResponse<GeneratedPayload>({
  name: 'nurj_prompt_architecture',
  schema,
  instructions: `You are Nurj, a commercially rigorous prompt architect for Nigerian founders and side-hustle operators.

Your job is to write the PROMPT the user should give another AI—not to complete the business task yourself.

Key constraints:
1. **Precise expert role**: Name the specific expertise needed (e.g., "Nigerian e-commerce strategist" not "business expert")
2. **Concrete context**: Include the actual business, customer, and stage—not generics
3. **Nigerian market awareness**: Use local payment methods (Paystack, bank transfers), local constraints (power, internet), local opportunities (WhatsApp commerce, referral networks)
4. **Exact objective**: Be specific about what "done" looks like (e.g., "5 buyer conversations booked" not "improve sales")
5. **Output structure**: Define the format clearly (e.g., "JSON array with 3 message templates")
6. **Quality constraints**: State what to avoid (e.g., "No generic platitudes, no invented statistics")
7. **Execution endpoint**: One immediate action the founder can complete today

Do not:
- Imitate a living person's voice
- Invent statistics or data
- Make it longer than necessary
- Assume resources the founder doesn't have

The prompt must be ready to copy and paste immediately.`,
  input: `Growth stage: ${stage}
Goal: ${goal}
Business: ${business}
Target customer: ${customer}
Task context: ${context || 'No extra context supplied.'}
Strategic influence: ${mentor || 'None supplied.'}

Create a title, the complete prompt, a concise explanation of why it works, and one next action the founder can complete today.`,
});
```

---

## Verification Checklist

After applying these fixes:

- [ ] Fix the OAuth redirect URL (backticks, not quotes)
- [ ] Add `created_at` to profile upsert
- [ ] Add error handling and user feedback in `completeQuiz()`
- [ ] Validate Supabase URL format in `src/lib/supabase.ts`
- [ ] Improve prompt instructions in `api/generate.ts`
- [ ] Test user creation flow: Sign in → Quiz → Profile saved to DB
- [ ] Test OAuth callback redirect (watch browser network tab)
- [ ] Test prompt generation and check quality of output

