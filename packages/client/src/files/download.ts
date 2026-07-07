import { fetchFileChunkApi } from '../api';
import { FileEntry } from '../content-tree/entities';
import { decryptFileChunks, getDecryptedFileKeyById } from './file-decrypt';
import { writeFileStreamToBlob } from './write-file-to-blob';
import { writeFileStreamToFs } from './download/write-file-to-fs';
import { SIZE_THRESHOLD } from '../utils/constants';

export async function downloadFile(
  fileEntry: FileEntry,
  onChunkDownloaded?: (chunkIndex: number, bytes: number) => void
): Promise<void> {
  const isLarge = fileEntry.size >= SIZE_THRESHOLD;
  const isChromium = 'showSaveFilePicker' in window;

  const fetchChunk = async (fileId: string, index: number): Promise<Uint8Array> => {
    const chunk = await fetchFileChunkApi(fileId, index);
    onChunkDownloaded?.(index, chunk.length);
    return chunk;
  };

  const fileKey = await getDecryptedFileKeyById(fileEntry.id);
  const chunkStream = decryptFileChunks({
    fileId: fileEntry.id,
    fileKey,
    totalChunks: fileEntry.chunkCount,
    fetchChunk,
  });

  if (!isLarge) {
    return writeFileStreamToBlob(fileEntry.name, chunkStream);
  }

  if (isChromium) {
    return await writeFileStreamToFs(fileEntry.name, chunkStream);
  }
  //
  // if (fileEntry.size <= MAX_BLOB_FALLBACK) {
  //   return await writeFileStreamToBlob(fileEntry.name, chunkStream);
  // }

  throw new Error('Downloading large files is only supported on Chromium browsers.');
}

export async function decryptAndMergeFileChunks(params: {
  fileId: string;
  totalChunks: number;
}): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  const fileKey = await getDecryptedFileKeyById(params.fileId);

  const fetchChunk = async (fileId: string, index: number): Promise<Uint8Array> => {
    return await fetchFileChunkApi(fileId, index);
  };

  for await (const chunk of decryptFileChunks({
    ...params,
    fileKey: fileKey,
    fetchChunk,
  })) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}
