export async function writeFileStreamToBlob(fileName: string, stream: AsyncGenerator<Uint8Array>) {
  const readable = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await stream.next();
      if (done) return controller.close();
      controller.enqueue(value);
    },
  });

  const blob = await new Response(readable).blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();

  URL.revokeObjectURL(url);

  setTimeout(() => URL.revokeObjectURL(url), 200); // delay to avoid immediate GC
}
