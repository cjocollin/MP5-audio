const METADATA_SYSTEM_PROMPT =
  "You suggest optional music discovery metadata. Respond with valid JSON only. Tags must be lowercase.";

export const LYRICS_TRANSCRIPTION_SYSTEM_PROMPT =
  "You transcribe sung or spoken words from audio. Respond with valid JSON only. " +
  "Write ONLY words you actually hear in the audio clip. " +
  "Never invent lyrics, never complete partial lines from imagination, and never recall lyrics from training data or song metadata.";

export interface CloudAdapterOptions {
  systemPrompt?: string;
  temperature?: number;
}

function isClientErrorStatus(status: number): boolean {
  return status === 400 || status === 422;
}

function isJsonModeMismatch(detail: string): boolean {
  return /response_format|json_object|json mode|structured/i.test(detail);
}

/** Newer GPT models only allow the default temperature (omit the field). */
function isTemperatureUnsupported(detail: string): boolean {
  return /temperature/i.test(detail) && /unsupported|does not support|only the default/i.test(detail);
}

async function openAiChatCompletion(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ res: Response; detail: string }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.ok) return { res, detail: "" };
  const detail = await res.text().catch(() => "");
  return { res, detail };
}

function openAiMessageContent(body: { choices?: { message?: { content?: string } }[] }): string {
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Cloud AI returned an empty response.");
  return content;
}

/**
 * OpenAI-compatible chat/completions with retries for models that reject
 * json_object mode and/or non-default temperature.
 */
async function callOpenAiCompatibleChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: unknown[],
  temperature: number | undefined,
): Promise<string> {
  async function attempt(includeJsonMode: boolean, includeTemperature: boolean): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages,
      ...(includeTemperature && temperature !== undefined ? { temperature } : {}),
      ...(includeJsonMode ? { response_format: { type: "json_object" } } : {}),
    };

    const { res, detail } = await openAiChatCompletion(baseUrl, apiKey, body);

    if (!res.ok && includeTemperature && isClientErrorStatus(res.status) && isTemperatureUnsupported(detail)) {
      return attempt(includeJsonMode, false);
    }

    if (!res.ok && includeJsonMode && isClientErrorStatus(res.status) && isJsonModeMismatch(detail)) {
      return attempt(false, includeTemperature);
    }

    if (!res.ok) {
      throw new Error(`Cloud AI request failed (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
    }

    return openAiMessageContent((await res.json()) as { choices?: { message?: { content?: string } }[] });
  }

  return attempt(true, temperature !== undefined);
}

export async function callOpenAiStyleChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  return callOpenAiCompatibleChat(
    baseUrl,
    apiKey,
    model,
    [
      { role: "system", content: METADATA_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    0.3,
  );
}

export async function callAnthropicMessages(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: METADATA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude request failed (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }

  const body = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = body.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Claude returned an empty response.");
  return text;
}

export async function callGeminiGenerate(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  let root = baseUrl.replace(/\/$/, "");
  if (root.endsWith("/v1") && !root.endsWith("/v1beta")) {
    root = `${root}beta`;
  }
  const url = `${root}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: METADATA_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function callGeminiGenerateWithAudio(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  wavBase64?: string,
  opts?: CloudAdapterOptions,
): Promise<string> {
  let root = baseUrl.replace(/\/$/, "");
  if (root.endsWith("/v1") && !root.endsWith("/v1beta")) {
    root = `${root}beta`;
  }
  const url = `${root}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
  if (wavBase64) {
    parts.push({ inlineData: { mimeType: "audio/wav", data: wavBase64 } });
  }
  parts.push({ text: userPrompt });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: opts?.systemPrompt ?? METADATA_SYSTEM_PROMPT }],
      },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: opts?.temperature ?? 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini request failed (${res.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function callOpenAiStyleChatWithAudio(
  baseUrl: string,
  apiKey: string,
  model: string,
  userPrompt: string,
  wavBase64: string,
  opts?: CloudAdapterOptions,
): Promise<string> {
  return callOpenAiCompatibleChat(
    baseUrl,
    apiKey,
    model,
    [
      { role: "system", content: opts?.systemPrompt ?? METADATA_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "input_audio", input_audio: { data: wavBase64, format: "wav" } },
        ],
      },
    ],
    opts?.temperature ?? 0.2,
  );
}
