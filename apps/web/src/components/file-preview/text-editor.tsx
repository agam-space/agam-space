'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

// Lazy load Monaco
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type Props = {
  content: string;
  fileId: string;
  fileName?: string;
  language?: string;
  onSave: (updated: string) => Promise<void>;
};

export function TextFileEditor({ content, fileId, language = 'plaintext', onSave }: Props) {
  const [value, setValue] = useState(content);
  const [original, setOriginal] = useState(content);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isChanged = value !== original;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(value);
      setOriginal(value); // ✅ resets change state
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='flex flex-col min-h-0 h-full w-full max-h-[85vh] max-w-[90vw] rounded-lg overflow-hidden border border-border/50 mt-4 mb-8'>
      <div className='flex-1 min-h-0'>
        <MonacoEditor
          language={language}
          value={value}
          onChange={v => setValue(v ?? '')}
          theme='vs-dark'
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            readOnly: true,
            scrollBeyondLastLine: false,
          }}
          width='100%'
          height='100%'
        />
      </div>
    </div>
  );
}
