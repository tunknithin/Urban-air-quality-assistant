import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import type { AqiStandard, AssistantReply, CityLocation, NormalizedAqiData } from '../../shared/types';
import { formatStandardLabel } from '../utils/aqiTheme';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  meta?: string;
}

interface AssistantViewProps {
  selectedLocation: CityLocation;
  standard: AqiStandard;
  aqi: NormalizedAqiData | null;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
}

const SUGGESTED_QUESTIONS = [
  'Is it safe to go running today?',
  'What is PM2.5 and why does it matter?',
  'Why is the AQI at this level right now?',
  'What precautions should sensitive groups take?',
];

export function AssistantView({
  selectedLocation,
  standard,
  aqi,
  initialPrompt,
  onConsumeInitialPrompt,
}: AssistantViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendingLockRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const submitQuestion = useCallback(
    async (rawQuestion: string) => {
      const trimmed = rawQuestion.trim();
      if (trimmed.length < 3 || sendingLockRef.current) return;

      sendingLockRef.current = true;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);
      setError(null);

      try {
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            question: trimmed,
            locationId: selectedLocation.id,
            lat: selectedLocation.latitude,
            lon: selectedLocation.longitude,
            name: selectedLocation.name,
            region: selectedLocation.region,
            country: selectedLocation.country,
            standard,
          }),
        });

        const json = (await res.json()) as { reply?: AssistantReply; error?: string };
        if (!res.ok || !json.reply) {
          setError(json.error ?? `Assistant could not answer right now (HTTP ${res.status}).`);
        } else {
          const modeLabel =
            json.reply.mode === 'gemini_live'
              ? `Gemini (${json.reply.modelUsed ?? 'gemini-4-hydrogen'})`
              : 'Rule-Based Advisory Fallback';
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: json.reply!.answer,
              meta: `${modeLabel} · Grounded in ${json.reply!.groundedInLocation} model estimate · ${json.reply!.disclaimer}`,
            },
          ]);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Network error while contacting the assistant.');
      } finally {
        sendingLockRef.current = false;
        if (!controller.signal.aborted) {
          setSending(false);
        }
      }
    },
    [selectedLocation, standard]
  );

  useEffect(() => {
    if (initialPrompt) {
      void submitQuestion(initialPrompt);
      onConsumeInitialPrompt?.();
    }
  }, [initialPrompt, submitQuestion, onConsumeInitialPrompt]);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitQuestion(input);
  }

  const activeAqiVal =
    aqi === null
      ? null
      : standard === 'cpcb'
      ? aqi.indices.cpcb.value
      : standard === 'european'
      ? aqi.indices.european.value
      : aqi.indices.usEpa.value;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
          AI Air Quality Assistant
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ask plain-English questions about air quality, pollutants, and outdoor precautions. Answers are grounded strictly in Open-Meteo CAMS model estimates for{' '}
          <span className="font-medium text-slate-800 dark:text-slate-200">
            {selectedLocation.name}
          </span>{' '}
          ({formatStandardLabel(standard)} AQI estimate: {activeAqiVal ?? 'Unavailable'}).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={sending}
            onClick={() => void submitQuestion(q)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-cyan-500/50 hover:text-cyan-700 dark:hover:text-cyan-300 disabled:opacity-50 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col min-h-[420px]">
        <div className="flex-1 p-5 space-y-5 overflow-y-auto max-h-[520px]" aria-live="polite">
          {messages.length === 0 ? (
            <div className="py-16 text-center space-y-2 max-w-md mx-auto">
              <Bot className="h-8 w-8 text-cyan-500 mx-auto" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Ready for air quality questions
              </h2>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Select a suggested prompt above or ask your own question. Guidance reflects regional model estimates and never issues medical diagnoses.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="h-8 w-8 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4" aria-hidden="true" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.meta && (
                    <p className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                      {msg.meta}
                    </p>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </div>
                )}
              </div>
            ))
          )}

          {sending && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Bot className="h-4 w-4 text-cyan-500" aria-hidden="true" />
              <span>Analyzing model estimates for {selectedLocation.name}...</span>
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mx-5 mb-3 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-600 dark:text-rose-400"
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleFormSubmit}
          className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3"
        >
          <label htmlFor="assistant-question-input" className="sr-only">
            Ask an air quality question
          </label>
          <input
            id="assistant-question-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${selectedLocation.name}'s air quality...`}
            maxLength={600}
            disabled={sending}
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || input.trim().length < 3}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
}
