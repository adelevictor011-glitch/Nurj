function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function optional(name: string): string | null {
  return process.env[name] || null;
}

export const env = {
  get supabaseUrl() { return required('SUPABASE_URL'); },
  get supabaseServiceRoleKey() { return required('SUPABASE_SERVICE_ROLE_KEY'); },
  get openaiApiKey() { return optional('OPENAI_API_KEY'); },
  get openaiModel() { return process.env.OPENAI_MODEL || 'gpt-4o-mini'; },
  get paystackSecretKey() { return optional('PAYSTACK_SECRET_KEY'); },
  get appUrl() { return (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''); },
};
