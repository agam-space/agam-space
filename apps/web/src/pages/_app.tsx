import './globals.css';
import type { AppProps } from 'next/app';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/layout/app-shell';
import { UploadTray } from '@/components/upload/upload-tray';
import { DownloadTray } from '@/components/download/download-tray';
import { useRouter } from 'next/router';
import { useAccessBootstrap } from '@/hooks/useAccessBootstrap';
import { useEffect, useState } from 'react';
import { useAppBootstrap } from '@/lib/init/use-bootstrap-app';
import { GlobalEventListeners } from '@/components/global-event-listeners';
import { PageLoader } from '@/components/page-loader';
import { ServiceWorkerManager } from '@/components/service-worker-manager';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const PUBLIC_ROUTES = ['/login', '/signup'];
const PUBLIC_ROUTE_PREFIXES = ['/public/share'];
export const SIDEBAR_ROUTES = ['/explorer', '/trash', '/public-shares'];
const ROUTES_REQUIRING_UNLOCK = ['/explorer', '/trash', '/public-shares'];

export function matchPrefix(pathname: string, patterns: string[]) {
  return patterns.some(p => pathname.startsWith(p));
}

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();

  // Check if route is public BEFORE initializing anything
  const isPublic = PUBLIC_ROUTES.includes(pathname) || matchPrefix(pathname, PUBLIC_ROUTE_PREFIXES);

  const appBootstrapped = useAppBootstrap(isPublic);

  const showAppShell = !isPublic;
  const showSidebar = matchPrefix(pathname, SIDEBAR_ROUTES);
  const needsUnlock = matchPrefix(pathname, ROUTES_REQUIRING_UNLOCK);

  const status = useAccessBootstrap(
    isPublic ? 'public' : needsUnlock ? 'unlocked' : 'loggedIn',
    appBootstrapped
  );

  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (status === 'ready') setReady(true);
  }, [status]);

  if (showAppShell && (!appBootstrapped || status !== 'ready')) {
    return <PageLoader />;
  }

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <GlobalEventListeners />
      <ServiceWorkerManager />
      {showAppShell && ready ? (
        <AppShell showSidebar={showSidebar}>
          <Component {...pageProps} />
          <div className='fixed safe-bottom safe-left safe-right sm:left-auto sm:w-full sm:max-w-md z-50 flex flex-col-reverse gap-3 pointer-events-none [--safe-bottom-offset:1rem] [--safe-left-offset:1rem] [--safe-right-offset:1rem]'>
            <UploadTray />
            <DownloadTray />
          </div>
        </AppShell>
      ) : (
        <Component {...pageProps} />
      )}
      <Toaster richColors position='bottom-right' />
    </div>
  );
}
