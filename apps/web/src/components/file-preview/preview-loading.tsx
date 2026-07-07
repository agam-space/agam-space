import { Loader2 } from 'lucide-react';

export function PreviewLoading() {
  return (
    <div className='flex flex-col items-center justify-center min-h-[400px] text-muted-foreground gap-3'>
      <Loader2 className='w-8 h-8 animate-spin' />
      <span className='text-sm'>Loading preview…</span>
    </div>
  );
}
