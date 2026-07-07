'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Smartphone } from 'lucide-react';
import { useTrustedDevicesStore } from '@/store/trusted-devices.store';
import { usePreferencesStore } from '@/store/preferences.store';
import { useE2eeKeys } from '@/store/e2ee-keys.store';
import { TrustedDevicesService } from '@/services/trusted-devices.service';
import { ApiClientError } from '@agam-space/client';
import { toast } from 'sonner';
import { useAuth } from '@/store/auth';

export default function TrustedDevicesPage() {
  const { devices, fetchDevices } = useTrustedDevicesStore();
  const user = useAuth(s => s.user);
  const { security, setClearDeviceDataOnLogout } = usePreferencesStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { e2eeKeys } = useE2eeKeys();
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    async function checkCurrentDevice() {
      if (!user?.id) {
        setCurrentDeviceId(null);
        return;
      }
      const deviceData = await TrustedDevicesService.getDeviceData(user.id);
      setCurrentDeviceId(deviceData?.deviceId || null);
    }
    checkCurrentDevice();
  }, [user?.id, devices]);

  const isCurrentDeviceRegistered = currentDeviceId && devices.some(d => d.id === currentDeviceId);

  const handleRegister = async () => {
    setLoading(true);
    setError(null);
    if (!e2eeKeys || !e2eeKeys.encCmkWithPassword || !e2eeKeys.kdfMetadata?.salt) {
      setError('Encryption keys are not set up. Please log out and log back in.');
      setLoading(false);
      return;
    }
    try {
      await TrustedDevicesService.registerDeviceWithPassword({
        userId: user!.id,
        deviceName,
        password,
        e2eeKeys: {
          encCmkWithPassword: e2eeKeys.encCmkWithPassword,
          kdfMetadata: { salt: e2eeKeys.kdfMetadata.salt },
        },
        fetchDevices,
        setModalOpen,
        setPassword,
        setDeviceName,
      });
      const deviceData = await TrustedDevicesService.getDeviceData(user!.id);
      if (deviceData) {
        setCurrentDeviceId(deviceData.deviceId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register device');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (deviceId: string) => {
    const isCurrent = deviceId === currentDeviceId;
    try {
      await TrustedDevicesService.removeDevice(deviceId, user!.id);
      if (isCurrent) {
        setCurrentDeviceId(null);
      }
      await fetchDevices();
      toast.success('Device removed successfully!');
    } catch (err: unknown) {
      let message = 'Failed to remove device';
      if (ApiClientError.isApiClientError(err)) {
        const apiErr = err as ApiClientError;
        if (apiErr.isUnauthorized()) {
          message = 'Authentication failed. Please log out and log back in.';
        } else if (apiErr.isServerError()) {
          message = 'Server error occurred. Please try again later.';
        } else {
          message = apiErr.message;
        }
      }
      toast.error(message);
    }
  };

  return (
    <div className='space-y-6'>
      <h2 className='text-xl font-semibold'>Trusted Devices</h2>

      {/* Current Device Section - only show if at least current device is registered */}
      {isCurrentDeviceRegistered && (
        <div className='border p-4 rounded-xl space-y-4'>
          <div>
            <h3 className='font-medium mb-1'>Current Device</h3>
            <p className='text-sm text-muted-foreground'>
              Manage this device's registration and preferences
            </p>
          </div>

          <div className='flex items-center justify-between pt-2'>
            <div className='space-y-1'>
              <h4 className='text-sm font-medium'>Registration Status</h4>
              <p className='text-xs text-muted-foreground'>
                {isCurrentDeviceRegistered
                  ? 'This device is registered for biometric unlock'
                  : 'This device is not registered yet'}
              </p>
            </div>
            <div className='flex items-center gap-2'>
              {isCurrentDeviceRegistered ? (
                <span className='px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary border border-primary/30'>
                  ✓ Registered
                </span>
              ) : (
                <Button onClick={() => setModalOpen(true)} size='sm'>
                  Register This Device
                </Button>
              )}
            </div>
          </div>

          <div className='border-t pt-4'>
            <div className='flex items-start justify-between gap-4'>
              <div className='flex-1'>
                <h4 className='text-sm font-medium mb-1'>Clear device data on logout</h4>
                <p className='text-xs text-muted-foreground'>
                  Remove this device's biometric unlock on logout. When disabled, the device unlock
                  key is safely stored encrypted in your browser - your data remains end-to-end
                  encrypted either way.
                </p>
              </div>
              <Switch
                checked={security.clearDeviceDataOnLogout}
                onCheckedChange={setClearDeviceDataOnLogout}
                className='ml-4'
              />
            </div>
          </div>
        </div>
      )}

      {/* All Registered Devices Section - only show if at least one device is registered */}
      {(devices.length > 0 || isCurrentDeviceRegistered) && (
        <div className='border p-4 rounded-xl'>
          <div className='mb-4'>
            <h3 className='font-medium mb-1'>All Registered Devices</h3>
            <p className='text-sm text-muted-foreground'>
              Devices that can unlock your account using biometrics
            </p>
          </div>

          {devices.length === 0 ? (
            <p className='text-sm text-muted-foreground text-center py-4'>
              No other devices registered. Only this device is registered.
            </p>
          ) : (
            <ul className='space-y-2'>
              {devices.map(device => {
                const isCurrent = currentDeviceId === device.id;
                return (
                  <li
                    key={device.id}
                    className='flex items-center justify-between border p-3 rounded bg-background'
                  >
                    <span className='flex items-center gap-2'>
                      <span className='font-medium'>{device.deviceName}</span>
                      {isCurrent && (
                        <span className='px-2 py-0.5 text-xs rounded bg-primary/10 text-primary border border-primary/30'>
                          This Device
                        </span>
                      )}
                    </span>
                    <Button variant='destructive' size='sm' onClick={() => handleRemove(device.id)}>
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Landing page - only show when NO devices registered at all */}
      {devices.length === 0 && !isCurrentDeviceRegistered && (
        <div className='border p-4 rounded-xl'>
          <div className='flex flex-col items-center justify-center py-12 text-center text-muted-foreground'>
            <Smartphone className='w-16 h-16 mb-6 text-muted' />
            <h2 className='text-xl font-semibold text-foreground mb-3'>No trusted devices yet</h2>
            <p className='text-sm max-w-lg mx-auto mb-6'>
              Register a device to enable quick and secure unlock using biometrics (WebAuthn). Once
              set up, you won't need to enter your master password every time, just use your
              device's biometric authentication. Your master key is never stored in plaintext.
            </p>
            <Button onClick={() => setModalOpen(true)} className='mb-4'>
              Register This Device
            </Button>
            <a
              href='https://docs.agamspace.app/security/cmk-unlock'
              target='_blank'
              rel='noopener noreferrer'
              className='text-sm text-primary hover:underline'
            >
              Learn more in our security docs →
            </a>
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className='bg-background'>
          <DialogHeader>
            <DialogTitle>Register Trusted Device</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <Input
              placeholder='Device Name'
              value={deviceName}
              onChange={e => setDeviceName(e.target.value)}
              disabled={loading}
              autoComplete='off'
            />
            <Input
              type='password'
              placeholder='Enter your master password'
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              autoComplete='new-password'
            />
            {error && <div className='text-red-500 text-sm'>{error}</div>}
            <Button onClick={handleRegister} disabled={loading || !password || !deviceName}>
              {loading ? 'Registering...' : 'Register'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
