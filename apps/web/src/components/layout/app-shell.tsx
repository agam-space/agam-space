import { useAuth } from '@/store/auth';
import { LogOut, MenuIcon, Settings, ShieldCheck } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';

import { ExplorerSidebarBase } from '@/components/explorer/explorer-sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SessionService } from '@/services/session.service';
import Link from 'next/link';
import { matchPrefix, SIDEBAR_ROUTES } from '@/pages/_app';

interface Props {
  children: ReactNode;
  showSidebar?: boolean;
}

export function AppShell({ children, showSidebar }: Props) {
  const user = useAuth(s => s.user);
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initials = user?.username?.[0]?.toUpperCase() ?? 'U';

  const isPrivileged = user?.role === 'owner' || user?.role === 'admin';

  // Inside component
  const pathname = usePathname();

  const handleLogout = async () => {
    await SessionService.logout();
    router.replace('/login');
  };

  return (
    <div className='min-h-screen flex flex-col'>
      {/* Topbar */}
      <header className='h-14 border-b bg-background text-foreground px-4 sm:px-6 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          {/* Show menu button on small screens, only on routes with a sidebar to show */}
          {showSidebar && (
            <button
              className='sm:hidden p-2 rounded hover:bg-muted'
              onClick={() => setSidebarOpen(true)}
            >
              <MenuIcon className='w-5 h-5' />
            </button>
          )}

          <Link href='/explorer' className='font-semibold text-lg hover:opacity-80'>
            Agam Space
          </Link>
        </div>
        {/*<Link href="/explorer" className="font-semibold text-lg hover:opacity-80 transition">*/}
        {/*  Agam Space*/}
        {/*</Link>*/}
        <div className='flex items-center justify-end gap-2'>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='w-9 h-9 rounded-full bg-muted text-base font-semibold flex items-center justify-center hover:bg-muted/80 transition'>
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              className='w-40 bg-card text-card-foreground text-sm shadow-md rounded-md'
            >
              <div className='px-2 py-1 text-sm text-muted-foreground select-none'>
                {user?.username ?? 'User'}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href='/settings/account' className='flex items-center gap-2'>
                  <Settings className='w-4 h-4' />
                  Settings
                </Link>
              </DropdownMenuItem>
              {isPrivileged && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href='/admin' className='flex items-center gap-2'>
                      <ShieldCheck className='w-4 h-4' />
                      Admin Console
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className='flex items-center gap-2'>
                <LogOut className='w-4 h-4' />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side='left' className='w-60 p-0'>
          <div className='p-4 bg-muted/10 h-full'>
            <SheetHeader>
              <SheetTitle className='text-base mb-4'>Menu</SheetTitle>
            </SheetHeader>
            <ExplorerSidebarBase onNavigate={() => setSidebarOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Layout */}
      <div className='flex flex-1'>
        {showSidebar && (
          <aside className='hidden sm:block w-60 border-r p-4 bg-muted/10 overflow-y-auto max-h-[calc(100vh-3.5rem)]'>
            {matchPrefix(pathname, SIDEBAR_ROUTES) && <ExplorerSidebarBase />}
          </aside>
        )}
        <main className='flex-1 overflow-y-auto'>{children}</main>
      </div>
    </div>
  );
}
