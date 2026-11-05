'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// An exposed constructor does not guarantee that the host enables its service.
type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlternative; length: number };
type SpeechResultList = { length: number; [index: number]: SpeechResult };
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult:
    | ((event: { resultIndex: number; results: SpeechResultList }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const browser = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}

export type SpeechErrorKind =
  | 'denied'
  | 'service'
  | 'network'
  | 'microphone'
  | 'noSpeech'
  | 'unsupported'
  | 'failed';
const START_TIMEOUT_MS = 12000;
const STOP_TIMEOUT_MS = 1500;

export function useSpeechInput({
  lang,
  onFinalText,
}: {
  lang: string;
  onFinalText: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [starting, setStarting] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<SpeechErrorKind | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const requestedRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalRef = useRef(onFinalText);
  useEffect(() => {
    onFinalRef.current = onFinalText;
  }, [onFinalText]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const dispose = useCallback(() => {
    clearTimer();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onstart =
        recognition.onresult =
        recognition.onerror =
        recognition.onend =
          null;
      try {
        recognition.abort();
      } catch {
        /* Already ended. */
      }
    }
  }, [clearTimer]);

  const finish = useCallback(
    (kind: SpeechErrorKind | null = null) => {
      requestedRef.current = false;
      dispose();
      if (!mountedRef.current) return;
      setStarting(false);
      setListening(false);
      setInterim('');
      setError(kind);
    },
    [dispose],
  );

  const stop = useCallback(() => {
    requestedRef.current = false;
    clearTimer();
    setStarting(false);
    setListening(false);
    setInterim('');
    const recognition = recognitionRef.current;
    if (!recognition) return;
    // stop() can flush the last phrase; keep its final-result handler until end.
    timerRef.current = setTimeout(() => finish(), STOP_TIMEOUT_MS);
    try {
      recognition.stop();
    } catch {
      finish();
    }
  }, [clearTimer, finish]);

  const start = useCallback(() => {
    if (requestedRef.current) return;
    dispose();
    setError(null);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      finish('unsupported');
      return;
    }
    requestedRef.current = true;
    setStarting(true);
    setListening(false);
    setInterim('');
    try {
      const recognition = new Ctor();
      recognitionRef.current = recognition;
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      const finalIndices = new Set<number>();
      let receivedText = false;
      const current = () =>
        mountedRef.current && recognitionRef.current === recognition;
      recognition.onstart = () => {
        if (!current() || !requestedRef.current) return;
        clearTimer();
        setStarting(false);
        setListening(true);
      };
      recognition.onresult = (event) => {
        if (!current()) return;
        let pending = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? '';
          if (text.trim()) receivedText = true;
          if (result.isFinal) {
            if (text.trim() && !finalIndices.has(i)) {
              finalIndices.add(i);
              onFinalRef.current(text);
            }
          } else pending += text;
        }
        setInterim(pending);
      };
      recognition.onerror = (event) => {
        if (!current()) return;
        if (event.error === 'aborted' && !requestedRef.current) {
          finish();
          return;
        }
        const errors: Record<string, SpeechErrorKind> = {
          'not-allowed': 'denied',
          'service-not-allowed': 'service',
          network: 'network',
          'audio-capture': 'microphone',
          'no-speech': 'noSpeech',
        };
        finish(errors[event.error] ?? 'failed');
      };
      recognition.onend = () => {
        if (!current()) return;
        // Do not restart immediate service failures in a tight loop or hide the control.
        finish(requestedRef.current && !receivedText ? 'noSpeech' : null);
      };
      timerRef.current = setTimeout(() => finish('failed'), START_TIMEOUT_MS);
      recognition.start();
    } catch {
      finish('failed');
    }
  }, [clearTimer, dispose, finish, lang]);

  const toggle = useCallback(() => {
    if (requestedRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => {
    mountedRef.current = true;
    setSupported(getRecognitionCtor() !== null);
    return () => {
      mountedRef.current = false;
      requestedRef.current = false;
      dispose();
    };
  }, [dispose]);

  const clearError = useCallback(() => setError(null), []);
  return {
    supported,
    starting,
    listening,
    active: starting || listening,
    interim,
    error,
    clearError,
    start,
    stop,
    toggle,
  };
}
