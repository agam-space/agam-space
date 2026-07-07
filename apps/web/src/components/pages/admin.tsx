'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AdminUserList } from '@/components/pages/admin/admin-users';
import { usePathname, useRouter } from 'next/navigation';
import { AdminInviteCodes } from '@/components/pages/admin/admin-invite-codes';

const sections = [
  { label: 'Users', href: '/admin/users' },
  { label: 'Invite Codes', href: '/admin/invites' },
  // { label: 'System', href: '/admin/system' },
];

export default function AdminPage() {
  const pathname = usePathname();
  const router = useRouter();

  // Redirect to /admin/users if on base /admin path
  useEffect(() => {
    if (!pathname || pathname === '/admin/') {
      router.replace('/admin/users');
    }
  }, [pathname, router]);

  // Derive active section from current pathname
  const activeSection = sections.find(s => pathname.startsWith(s.href)) || sections[0];

  return (
    <div className='flex flex-col sm:flex-row h-full'>
      {/* Mobile: horizontal scrollable tab bar */}
      <div className='sm:hidden flex gap-2 overflow-x-auto border-b p-3 -mb-px'>
        {sections.map(section => (
          <Button
            key={section.label}
            variant={activeSection?.href === section.href ? 'default' : 'ghost'}
            size='sm'
            className='shrink-0'
            onClick={() => {
              router.push(section.href);
            }}
          >
            {section.label}
          </Button>
        ))}
      </div>

      {/* Desktop: left sidebar */}
      <div className='hidden sm:block w-48 border-r p-4 space-y-2'>
        {sections.map(section => (
          <Button
            key={section.label}
            variant={activeSection?.href === section.href ? 'default' : 'ghost'}
            className='w-full justify-start'
            onClick={() => {
              router.push(section.href);
            }}
          >
            {section.label}
          </Button>
        ))}
      </div>

      {/* Main content */}
      <div className='flex-1 p-4 sm:p-6 overflow-y-auto'>
        {activeSection?.label === 'Users' && <AdminUserList />}
        {activeSection?.label === 'Invite Codes' && <AdminInviteCodes />}

        {/* {activeSection?.label === 'System' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">System Configuration</h2>
            <p className="text-muted-foreground">Coming soon: tweak global app settings or feature flags.</p>
          </div>
        )} */}
      </div>
    </div>
  );
}
