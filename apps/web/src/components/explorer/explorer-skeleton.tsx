import { Skeleton } from '@/components/ui/skeleton';

export function ExplorerSkeleton({ view }: { view: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <div className='divide-y'>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className='flex items-center h-12 px-4 pr-8 gap-3'>
            <Skeleton className='w-5 h-5 rounded' />
            <Skeleton className='h-4 flex-1 max-w-xs' />
            <Skeleton className='h-3 w-16 ml-auto' />
            <Skeleton className='h-3 w-24 hidden sm:block' />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='p-4'>
      <div className='grid [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-4'>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className='flex flex-col items-center justify-center gap-2 h-[104px] p-4 border rounded-lg'
          >
            <Skeleton className='w-6 h-6 rounded' />
            <Skeleton className='h-3 w-3/4' />
          </div>
        ))}
      </div>
    </div>
  );
}
