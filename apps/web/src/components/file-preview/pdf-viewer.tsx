'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

type Props = {
  data: Uint8Array;
};

const DEFAULT_SCALE = 1.25;
const PAGE_PADDING_PX = 32;

export function PdfViewer({ data }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [visiblePage, setVisiblePage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const clonedData = useMemo(() => Uint8Array.from(data), [data]);
  const memoFile = useMemo(() => ({ data: clonedData }), [clonedData]);

  // Fit-to-width scale, computed once the container size and natural page width are known.
  const fitScale =
    containerWidth && pageWidth
      ? Math.min((containerWidth - PAGE_PADDING_PX) / pageWidth, DEFAULT_SCALE)
      : DEFAULT_SCALE;
  const scale = fitScale * zoom;

  // Track container width so the PDF can fit narrow (mobile) viewports.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Scroll tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.find(e => e.isIntersecting);
        if (visible?.target) {
          const pageNum = Number(visible.target.getAttribute('data-page'));
          if (pageNum) setVisiblePage(pageNum);
        }
      },
      { root: containerRef.current, threshold: 0.6 }
    );

    const targets = containerRef.current?.querySelectorAll('[data-page]');
    targets?.forEach(t => observer.observe(t));

    return () => observer.disconnect();
  }, [numPages]);

  return (
    <div className='relative flex flex-col w-full h-full'>
      {/* PDF pages */}
      <div ref={containerRef} className='flex-1 overflow-auto'>
        <Document
          file={memoFile}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading='Loading PDF...'
          error='Failed to load PDF'
          className='flex flex-col items-center py-4'
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i} data-page={i + 1} className='mb-4'>
              <Page
                pageNumber={i + 1}
                scale={scale}
                onLoadSuccess={page => {
                  if (i === 0) setPageWidth(page.originalWidth);
                }}
              />
            </div>
          ))}
        </Document>
      </div>

      {/* Floating controls at bottom center */}
      <div className='absolute safe-bottom [--safe-bottom-offset:1.5rem] left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 bg-card/95 backdrop-blur-sm rounded-full shadow-lg border border-border'>
        <div className='text-sm text-card-foreground font-medium'>
          {visiblePage} / {numPages}
        </div>
        <div className='h-4 w-px bg-border' />
        <div className='flex items-center gap-2'>
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            disabled={zoom <= 0.5}
            className='p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            aria-label='Zoom out'
          >
            <ZoomOut className='w-4 h-4' />
          </button>
          <span className='text-xs text-muted-foreground min-w-[45px] text-center'>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(2, z + 0.25))}
            disabled={zoom >= 2}
            className='p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
            aria-label='Zoom in'
          >
            <ZoomIn className='w-4 h-4' />
          </button>
        </div>
      </div>
    </div>
  );
}
