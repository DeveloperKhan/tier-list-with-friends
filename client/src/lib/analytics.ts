import posthog from 'posthog-js';

function track(event: string, props?: Record<string, unknown>) {
  console.log('[analytics]', event, props ?? '');
  posthog.capture(event, props);
}

export function initAnalytics() {
  const token = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN as string | undefined;
  const host = import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined;
  console.log('[analytics] token present:', !!token);
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
  track('session_joined', props);
}

export function trackGameStarted(props: {
  tierCount: number;
  itemCount: number;
  uploadCount: number;
  tiermakerCount: number;
  textCount: number;
  playerCount: number;
}) {
  track('game_started', props);
}

export function trackGameEnded(props: { durationSeconds: number; playerCount: number }) {
  track('game_ended', props);
}

export function trackSupportClicked(props: { page: 'setup' | 'waiting' }) {
  track('support_clicked', props);
}

export function trackImagesUploaded(props: { count: number; page: 'setup' | 'playing' }) {
  track('images_uploaded', props);
}

export function trackTextItemsAdded(props: { count: number; page: 'setup' | 'playing' }) {
  track('text_items_added', props);
}

export function trackTemplateLoaded(props: { itemCount: number }) {
  track('template_loaded', props);
}

export function trackExportCompleted() {
  track('export_completed');
}
