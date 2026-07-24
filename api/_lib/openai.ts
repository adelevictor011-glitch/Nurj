import OpenAI from 'openai';
import { env } from './env.js';

let client: OpenAI | null = null;

function openai() {
  client ??= new OpenAI({ apiKey: env.openaiApiKey });
  return client;
}

export interface StructuredResult<T> {
  data: T;
  usage: { model: string; inputTokens: number; outputTokens: number; totalTokens: number };
}

export async function createStructuredResponse<T>(params: {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
}): Promise<StructuredResult<T>> {
  const model = env.openaiModel;
  const response = await openai().responses.create({
    model,
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

  if (!response.output_text) throw new Error('The AI returned an empty response.');

  return {
    data: JSON.parse(response.output_text) as T,
    usage: {
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}
