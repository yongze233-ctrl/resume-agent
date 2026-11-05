'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RiSettings6Line, RiRobot2Line } from '@remixicon/react';
import { useTranslation } from 'react-i18next';
import {
  SettingsModalShell,
  type SettingsModalNavItem,
} from '@/components/application/settings/settings-modal';
import { Select, SelectItem } from '@/components/ui/product-select';
import {
  SettingsCard as SettingsCard,
  SettingsRow as SettingsRow,
} from '@/components/application/settings/settings-rows';
import { setPreferredLanguage } from '@/i18n';
import {
  useTheme,
  type ThemePreference,
} from '@/components/providers/ThemeProvider';
import { useSettingsUiStore, type SettingsSection } from '@/store/useSettingsUiStore';
import { useSettingStore } from '@/store/useSettingStore';
import { ModelConfigFields } from '@/components/llm/ModelConfigFields';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';


const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Settings hosted in the canonical settings modal shell. Appearance and
 * language apply as soon as they change, so there is nothing to save.
 */
export function SettingsModal() {
  const { t, i18n } = useTranslation();
  const reduce = useReducedMotion();
  const { theme, setTheme } = useTheme();
  const { settingsOpen, closeSettings, section, setSection } = useSettingsUiStore();
  const { isDirty, saveSettings, resetSettings } = useSettingStore();
  const siteModel = useSettingStore((state) => state.siteModel);
  const usingSiteModel = useSettingStore((state) => !!state.siteModel && (state.preferSiteModel || !state.apiKey.trim()));
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings();
      toast.success(t('settings.notifications.settingsSaved'));
    } catch {
      toast.error(t('settings.notifications.saveFailed'));
    } finally { setSaving(false); }
  };
  const currentLang = i18n.language.startsWith('en') ? 'en' : 'zh';

  const modalItems = useMemo<SettingsModalNavItem<SettingsSection>[]>(
    () => [
      {
        page: 'general',
        label: t('account.settings.nav.general'),
        icon: RiSettings6Line,
      },
      { page: 'model', label: t('account.settings.nav.model'), icon: RiRobot2Line },
    ],
    [t],
  );

  return (
    <SettingsModalShell
      isOpen={settingsOpen}
      onClose={closeSettings}
      activePage={section}
      onPageChange={setSection}
      title={t(`account.settings.nav.${section}`)}
      closeLabel={t('common.close')}
      navigationLabel={t('account.settings.title')}
      items={modalItems}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {section === 'model' ? (
            <Pane title={t('settings.llm.title')} description={siteModel ? '可直接使用站点默认模型，也可以填写自己的模型配置。' : t('settings.llm.description')}>
              {siteModel && <div className="mt-5 rounded-lg border border-mr-line bg-mr-surface-soft p-4 text-sm"><p className="font-medium">站点默认模型 · {siteModel.model}</p><p className="mt-1 text-text-secondary">{usingSiteModel ? '当前正在使用站点默认模型。' : '可切换到站点默认模型，个人配置会保留。'}</p><Button className="mt-3" variant="outline" disabled={usingSiteModel || saving} onClick={async () => { useSettingStore.getState().setPreferSiteModel(true); await handleSave(); }}>{usingSiteModel ? '正在使用' : '使用站点默认模型'}</Button></div>}
              <div className="mt-5"><ModelConfigFields /></div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" disabled={!isDirty || saving} onClick={resetSettings}>{t('settings.buttons.reset')}</Button>
                <Button disabled={!isDirty || saving} onClick={handleSave}>{t('settings.buttons.save')}</Button>
              </div>
            </Pane>
          ) : <Pane
            title={t('account.settings.nav.general')}
            description={t('account.settings.general.description')}
          >
            <SettingsCard className="mt-5">
              <SettingsRow
                label={t('account.settings.general.appearance')}
                description={t('account.settings.general.appearanceDescription')}
              >
                <Select
                  aria-label={t('account.settings.general.appearance')}
                  selectedKey={theme}
                  onSelectionChange={(key) =>
                    setTheme(String(key) as ThemePreference)
                  }
                  triggerClassName="h-8 min-w-[104px] gap-1 rounded-lg px-2 py-1.5"
                  popoverClassName="w-[180px]"
                >
                  <SelectItem id="dark">
                    {t('account.settings.general.appearanceDark')}
                  </SelectItem>
                  <SelectItem id="light">
                    {t('account.settings.general.appearanceLight')}
                  </SelectItem>
                  <SelectItem id="system">
                    {t('account.settings.general.appearanceSystem')}
                  </SelectItem>
                </Select>
              </SettingsRow>
              <SettingsRow
                label={t('account.settings.general.language')}
                description={t('account.settings.general.languageDescription')}
              >
                <Select
                  aria-label={t('account.settings.general.language')}
                  selectedKey={currentLang}
                  onSelectionChange={(key) =>
                    setPreferredLanguage(String(key) as 'en' | 'zh')
                  }
                  triggerClassName="h-8 min-w-[104px] gap-1 rounded-lg px-2 py-1.5"
                  popoverClassName="w-[180px]"
                >
                  <SelectItem id="en">
                    {t('account.settings.general.languageEnglish')}
                  </SelectItem>
                  <SelectItem id="zh">
                    {t('account.settings.general.languageChinese')}
                  </SelectItem>
                </Select>
              </SettingsRow>
            </SettingsCard>
          </Pane>}
        </motion.div>
      </AnimatePresence>
    </SettingsModalShell>
  );
}

function Pane({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full max-w-[640px] flex-col">
      <h3 className="sr-only">{title}</h3>
      {description && (
        <p className="text-body-2-regular text-text-secondary max-w-[58ch]">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
