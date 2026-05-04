import posthog from 'posthog-js';

export function initAnalytics() {
  const token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined;
  const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined;
  if (!token) return;
  posthog.init(token, {
    api_host: host ?? 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    persistence: 'memory',
  });
}

export function identifyUser(userId: string, username: string) {
  posthog.identify(userId, { username });
}

export function trackSessionJoined(props: { playerCount: number; isHost: boolean }) {
  posthog.capture('session_joined', props);
}

export function trackGameStarted(props: {
  tierCount: number;
  itemCount: number;
  uploadCount: number;
  tiermakerCount: number;
  textCount: number;
  playerCount: number;
}) {
  posthog.capture('game_started', props);
}

export function trackGameEnded(props: { durationSeconds: number; playerCount: number }) {
  posthog.capture('game_ended', props);
}

export function trackSupportClicked(props: { page: 'setup' | 'waiting' }) {
  posthog.capture('support_clicked', props);
}

export function trackImagesUploaded(props: { count: number; page: 'setup' | 'playing' }) {
  posthog.capture('images_uploaded', props);
}

export function trackTextItemsAdded(props: { count: number; page: 'setup' | 'playing' }) {
  posthog.capture('text_items_added', props);
}

export function trackTemplateLoaded(props: { itemCount: number }) {
  posthog.capture('template_loaded', props);
}

export function trackExportCompleted() {
  posthog.capture('export_completed');
}
