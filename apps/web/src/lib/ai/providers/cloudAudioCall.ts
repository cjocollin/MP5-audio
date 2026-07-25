import type { AiSettings } from "../aiSettings";
import { getAiProvider } from "../aiProviders";
import {
  callAnthropicMessages,
  callGeminiGenerateWithAudio,
  callOpenAiStyleChat,
  callOpenAiStyleChatWithAudio,
  LYRICS_TRANSCRIPTION_SYSTEM_PROMPT,
} from "./cloudAdapters";

export function providerSupportsAudio(providerId: string, apiStyle: string): boolean {
  if (apiStyle === "gemini") return true;
  if (apiStyle === "openai") {
    return providerId === "openai";
  }
  return false;
}

export async function callCloudWithOptionalAudio(
  settings: Pick<AiSettings, "providerId" | "apiKey" | "apiBaseUrl" | "model">,
  prompt: string,
  wavBase64?: string,
): Promise<string> {
  const provider = getAiProvider(settings.providerId) ?? getAiProvider("openai")!;
  const { apiStyle } = provider;

  if (wavBase64 && providerSupportsAudio(settings.providerId, apiStyle)) {
    if (apiStyle === "gemini") {
      return callGeminiGenerateWithAudio(settings.apiBaseUrl, settings.apiKey, settings.model, prompt, wavBase64);
    }
    if (apiStyle === "openai") {
      // Audio failure must surface — never silent fallthrough to text-only invention.
      return callOpenAiStyleChatWithAudio(
        settings.apiBaseUrl,
        settings.apiKey,
        settings.model,
        prompt,
        wavBase64,
      );
    }
  }

  if (apiStyle === "anthropic") {
    return callAnthropicMessages(settings.apiBaseUrl, settings.apiKey, settings.model, prompt);
  }
  if (apiStyle === "gemini") {
    return callGeminiGenerateWithAudio(settings.apiBaseUrl, settings.apiKey, settings.model, prompt);
  }
  return callOpenAiStyleChat(settings.apiBaseUrl, settings.apiKey, settings.model, prompt);
}

const LYRICS_ADAPTER_OPTS = {
  systemPrompt: LYRICS_TRANSCRIPTION_SYSTEM_PROMPT,
  temperature: 0,
};

/** Audio-only lyrics transcription — never falls back to text-only guessing. */
export async function callCloudLyricsTranscription(
  settings: Pick<AiSettings, "providerId" | "apiKey" | "apiBaseUrl" | "model">,
  prompt: string,
  wavBase64: string,
): Promise<string> {
  const provider = getAiProvider(settings.providerId) ?? getAiProvider("openai")!;
  const { apiStyle } = provider;

  if (!providerSupportsAudio(settings.providerId, apiStyle)) {
    throw new Error(
      "Cloud lyrics requires an audio-capable provider (Google Gemini or OpenAI). Text-only providers cannot transcribe vocals.",
    );
  }

  if (apiStyle === "gemini") {
    return callGeminiGenerateWithAudio(
      settings.apiBaseUrl,
      settings.apiKey,
      settings.model,
      prompt,
      wavBase64,
      LYRICS_ADAPTER_OPTS,
    );
  }

  if (apiStyle === "openai") {
    return callOpenAiStyleChatWithAudio(
      settings.apiBaseUrl,
      settings.apiKey,
      settings.model,
      prompt,
      wavBase64,
      LYRICS_ADAPTER_OPTS,
    );
  }

  throw new Error(
    "Cloud lyrics requires an audio-capable provider (Google Gemini or OpenAI). Text-only providers cannot transcribe vocals.",
  );
}
