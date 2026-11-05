'use client';

import { SettingsModal } from './SettingsModal';
import { useEffect } from 'react';
import { importLocalModelSetup } from '@/lib/ai/localModelSetup';
import { loadSiteModel } from '@/lib/ai/siteModelSetup';

/** Mounts the settings dialog once for the dashboard and the editor. */
export default function SettingsHost() {
  useEffect(() => { void importLocalModelSetup(); void loadSiteModel(); }, []);
  return <SettingsModal />;
}
