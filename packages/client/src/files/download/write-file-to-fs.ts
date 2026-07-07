// write-file-to-fs.ts
export async function writeFileStreamToFs(
  fileName: string,
  stream: AsyncGenerator<Uint8Array>
): Promise<void> {
  if (!('showSaveFilePicker' in window)) {
    throw new Error('File System Access API is not supported in this browser.');
  }

  const handle = await (window as any).showSaveFilePicker({
    suggestedName: fileName,
  });

  const writable = await handle.createWritable();

  for await (const chunk of stream) {
    await writable.write(chunk);
  }

  await writable.close();
}
