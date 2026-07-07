'use client';

import { useEffect } from 'react';
import { Infinity as InfinityIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@agam-space/client';
import { useUserQuotaStore } from '@/store/user-quota.store';

const StorageQuotaCard = () => {
  const { used, max, refresh } = useUserQuotaStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (used === null) return null;

  const isUnlimited = max === 0 || max === null;
  const percent = !isUnlimited ? Math.min((used / max) * 100, 100) : null;

  return (
    <div className='rounded-lg border border-border bg-card p-3.5 shadow-sm'>
      <div className='text-xs font-medium text-muted-foreground mb-1'>Storage Used</div>

      <div className='flex items-baseline gap-1.5 mb-2.5'>
        <span className='text-xs font-medium text-foreground'>{formatBytes(used)}</span>
        <span className='text-xs text-muted-foreground'>/</span>
        <span className='text-xs text-muted-foreground'>
          {max ? (
            formatBytes(max)
          ) : (
            <span className='inline-flex items-center gap-0.5'>
              <InfinityIcon className='w-3 h-3' />
            </span>
          )}
        </span>
        {percent !== null && (
          <span className='text-xs text-muted-foreground ml-auto'>{Math.round(percent)}%</span>
        )}
      </div>

      <div className='w-full h-2 bg-secondary/50 rounded-full overflow-hidden'>
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            percent !== null && percent >= 90
              ? 'bg-destructive'
              : percent !== null && percent >= 70
                ? 'bg-orange-500'
                : 'bg-primary'
          )}
          style={{
            width: percent !== null ? `${percent}%` : '0%',
          }}
        />
      </div>
    </div>
  );
};

export { StorageQuotaCard };
