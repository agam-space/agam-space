'use client';

import { AccountSettingsSection } from '@/components/pages/settings/account';
import TrustedDevicesPage from '@/components/pages/settings/devices';
import { RecoveryKeyModal } from '@/components/settings/recovery-key-model';
import { ResetPasswordModal } from '@/components/settings/reset-password-model';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePreferencesStore } from '@/store/preferences.store';
import { SessionUnlockManager } from '@/services/session-unlock-manager';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const sections = ['Account', 'Encryption', 'Trusted Devices'];

const tabToUrlMap = {
  Account: 'account',
  Encryption: 'encryption',
  'Trusted Devices': 'trusted-devices',
};

const urlToTabMap = {
  account: 'Account',
  encryption: 'Encryption',
  'trusted-devices': 'Trusted Devices',
};

interface SettingsPageProps {
  initialTab?: string;
}

export default function SettingsPage({ initialTab }: SettingsPageProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState('Account');
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const sessionAutoUnlock = usePreferencesStore(s => s.security?.sessionAutoUnlock ?? false);
  const setSessionAutoUnlock = usePreferencesStore(s => s.setSessionAutoUnlock);

  const handleAutoUnlockToggle = async (enabled: boolean) => {
    setSessionAutoUnlock(enabled);
    if (!enabled) {
      await SessionUnlockManager.clearAutoUnlockData();
    }
  };

  useEffect(() => {
    if (initialTab && urlToTabMap[initialTab as keyof typeof urlToTabMap]) {
      setActiveSection(urlToTabMap[initialTab as keyof typeof urlToTabMap]);
    }
  }, [initialTab]);

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    const urlTab = tabToUrlMap[section as keyof typeof tabToUrlMap];
    if (urlTab) {
      router.push(`/settings/${urlTab}`, undefined, { shallow: true }).catch(() => {
        // Ignore routing errors - state is already updated
      });
    }
  };

  return (
    <div className='flex flex-col sm:flex-row h-full'>
      {/* Mobile: horizontal scrollable tab bar */}
      <div className='sm:hidden flex gap-2 overflow-x-auto border-b p-3 -mb-px'>
        {sections.map(section => (
          <Button
            key={section}
            variant={activeSection === section ? 'default' : 'ghost'}
            size='sm'
            className='shrink-0'
            onClick={() => handleSectionChange(section)}
          >
            {section}
          </Button>
        ))}
      </div>

      {/* Desktop: left navigation */}
      <div className='hidden sm:block w-48 border-r p-4 space-y-2'>
        {sections.map(section => (
          <Button
            key={section}
            variant={activeSection === section ? 'default' : 'ghost'}
            className='w-full justify-start'
            onClick={() => handleSectionChange(section)}
          >
            {section}
          </Button>
        ))}
      </div>

      {/* Right Detail Pane */}
      <div className='flex-1 p-4 sm:p-6 overflow-y-auto'>
        {activeSection === 'Encryption' && (
          <div className='space-y-6'>
            <h2 className='text-xl font-semibold'>Encryption Settings</h2>

            <div className='border p-4 rounded-xl'>
              <div className='flex items-start justify-between'>
                <div className='flex-1'>
                  <h3 className='font-medium'>Auto-unlock on page reload</h3>
                  <p className='text-sm text-muted-foreground mt-1'>
                    Skip re-entering your master password when reloading or opening new tabs.
                    <br />
                    Auto-unlock for security, expires after every 15 minutes or when you log out.
                  </p>
                </div>
                <Switch
                  checked={sessionAutoUnlock}
                  onCheckedChange={handleAutoUnlockToggle}
                  className='ml-4'
                />
              </div>
            </div>

            <div className='border p-4 rounded-xl'>
              <h3 className='font-medium'>Show Recovery Key</h3>
              <p className='text-sm text-muted-foreground mb-2'>
                Retrieve your recovery key for account recovery.
              </p>
              <Button variant='outline' onClick={() => setShowRecoveryModal(true)}>
                View Recovery Key
              </Button>
            </div>

            <div className='border p-4 rounded-xl'>
              <h3 className='font-medium'>Reset Master Password</h3>
              <p className='text-sm text-muted-foreground mb-2'>
                Use your recovery key to reset your master password.
              </p>
              <Button variant='outline' onClick={() => setShowResetModal(true)}>
                Start Reset
              </Button>
            </div>
          </div>
        )}

        {activeSection === 'Account' && <AccountSettingsSection />}

        {activeSection === 'Trusted Devices' && <TrustedDevicesPage />}
      </div>
      <RecoveryKeyModal open={showRecoveryModal} onClose={() => setShowRecoveryModal(false)} />
      <ResetPasswordModal open={showResetModal} onClose={() => setShowResetModal(false)} />
    </div>
  );
}
