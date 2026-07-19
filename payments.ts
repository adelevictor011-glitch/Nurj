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

  if (!response.output_text) throw new Error('The AI returned an empty response.');
  return JSON.parse(response.output_text) as T;
}
