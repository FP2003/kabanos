// TODO: Add keyboard shortcuts to the command palette
// FIXME: Handle expired sessions before refreshing the dashboard

export function startApplication() {
  return { status: 'ready' };
}

/* HACK: Replace the temporary feature-flag lookup with the shared client */
export const featureEnabled = true;
