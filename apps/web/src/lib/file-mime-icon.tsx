import { File, FileArchive, FileCode, FileText, Image, Music, Video } from 'lucide-react';

import {
  IconFile,
  IconFileCode,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeDocx,
  IconFileTypeXls,
  IconFileTypePpt,
  IconFileTypeZip,
  IconFileTypePng,
  IconFileTypeJpg,
  IconFileTypeTxt,
  IconFileTypeJs,
  IconFileTypeJsx,
  IconFileTypeHtml,
  IconFileTypeCss,
  IconFileTypeTs,
  IconFileTypeTsx,
  IconFileTypeXml,
  IconFileTypeCsv,
  IconFileTypePhp,
  IconFileTypeVue,
  IconFileTypeBmp,
  IconFileTypeSvg,
  IconFileTypeSql,
  IconFileTypeRs,
  IconFileZip,
  IconFileMusic,
  IconFileDatabase,
  IconJson,
  IconMarkdown,
  IconTerminal2,
  IconCertificate,
  IconVector,
  IconBrandFigma,
  IconBrandSketch,
  IconBrandPython,
  IconBrandGolang,
  IconBrandCpp,
  IconBrandCSharp,
  IconBrandWindows,
  IconBrandDebian,
  IconPackage,
  IconDisc,
  IconVideo,
  IconMusic,
  IconCamera,
  IconPhoto,
} from '@tabler/icons-react';

export function getFileIcon(mimeType?: string, filename?: string): React.ReactNode {
  const ext = filename ? getExtension(filename) : '';

  if (
    mimeType?.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)
  ) {
    return <Image className='w-5 h-5 text-blue-500' />;
  }

  if (mimeType?.startsWith('video/') || ['mp4', 'mkv', 'webm', 'mov'].includes(ext)) {
    return <Video className='w-5 h-5 text-purple-500' />;
  }

  if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac'].includes(ext)) {
    return <Music className='w-5 h-5 text-pink-500' />;
  }

  if (mimeType === 'application/zip' || ['zip', 'rar', '7z'].includes(ext)) {
    return <FileArchive className='w-5 h-5 text-orange-500' />;
  }

  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return <FileText className='w-5 h-5 text-red-500' />;
  }

  if (
    mimeType?.includes('msword') ||
    mimeType?.includes('wordprocessingml') ||
    ['doc', 'docx'].includes(ext)
  ) {
    return <FileText className='w-5 h-5 text-blue-600' />;
  }

  if (
    mimeType?.includes('excel') ||
    mimeType?.includes('spreadsheetml') ||
    ['xls', 'xlsx'].includes(ext)
  ) {
    return <FileText className='w-5 h-5 text-green-600' />;
  }

  if (
    mimeType?.includes('powerpoint') ||
    mimeType?.includes('presentationml') ||
    ['ppt', 'pptx'].includes(ext)
  ) {
    return <FileText className='w-5 h-5 text-orange-600' />;
  }

  if (
    mimeType?.startsWith('text/') ||
    mimeType?.includes('json') ||
    ['txt', 'md', 'json'].includes(ext)
  ) {
    return <FileCode className='w-5 h-5 text-zinc-500' />;
  }

  return <File className='w-5 h-5 text-zinc-500' />;
}

const iconClass = 'w-5 h-5';

const EXTENSION_ICON_MAP: Record<string, React.ReactNode> = {
  // Documents
  pdf: <IconFileTypePdf className={`${iconClass} text-red-500`} />,
  doc: <IconFileTypeDoc className={`${iconClass} text-blue-600`} />,
  docx: <IconFileTypeDocx className={`${iconClass} text-blue-600`} />,
  odt: <IconFileTypeDoc className={`${iconClass} text-blue-600`} />,
  xls: <IconFileTypeXls className={`${iconClass} text-green-600`} />,
  xlsx: <IconFileTypeXls className={`${iconClass} text-green-600`} />,
  ods: <IconFileTypeXls className={`${iconClass} text-green-600`} />,
  ppt: <IconFileTypePpt className={`${iconClass} text-orange-600`} />,
  pptx: <IconFileTypePpt className={`${iconClass} text-orange-600`} />,
  txt: <IconFileTypeTxt className={`${iconClass} text-zinc-500`} />,
  rtf: <IconFileTypeTxt className={`${iconClass} text-zinc-500`} />,
  md: <IconMarkdown className={`${iconClass} text-zinc-500`} />,
  mdx: <IconMarkdown className={`${iconClass} text-zinc-500`} />,
  csv: <IconFileTypeCsv className={`${iconClass} text-green-600`} />,
  tsv: <IconFileTypeCsv className={`${iconClass} text-green-600`} />,

  // Archives
  zip: <IconFileTypeZip className={`${iconClass} text-orange-500`} />,
  rar: <IconFileZip className={`${iconClass} text-orange-500`} />,
  '7z': <IconFileZip className={`${iconClass} text-orange-500`} />,
  tar: <IconFileZip className={`${iconClass} text-orange-500`} />,
  gz: <IconFileZip className={`${iconClass} text-orange-500`} />,
  bz2: <IconFileZip className={`${iconClass} text-orange-500`} />,

  // Images
  png: <IconFileTypePng className={`${iconClass} text-blue-500`} />,
  jpg: <IconFileTypeJpg className={`${iconClass} text-blue-500`} />,
  jpeg: <IconFileTypeJpg className={`${iconClass} text-blue-500`} />,
  bmp: <IconFileTypeBmp className={`${iconClass} text-blue-500`} />,
  svg: <IconFileTypeSvg className={`${iconClass} text-fuchsia-500`} />,
  gif: <IconPhoto className={`${iconClass} text-blue-500`} />,
  webp: <IconPhoto className={`${iconClass} text-blue-500`} />,
  heic: <IconPhoto className={`${iconClass} text-blue-500`} />,
  heif: <IconPhoto className={`${iconClass} text-blue-500`} />,
  tiff: <IconPhoto className={`${iconClass} text-blue-500`} />,
  ico: <IconPhoto className={`${iconClass} text-blue-500`} />,
  psd: <IconPhoto className={`${iconClass} text-indigo-500`} />,
  ai: <IconVector className={`${iconClass} text-orange-500`} />,
  eps: <IconVector className={`${iconClass} text-orange-500`} />,
  fig: <IconBrandFigma className={`${iconClass} text-fuchsia-500`} />,
  sketch: <IconBrandSketch className={`${iconClass} text-yellow-500`} />,

  // Video / audio
  mp4: <IconVideo className={`${iconClass} text-purple-600`} />,
  mkv: <IconVideo className={`${iconClass} text-purple-600`} />,
  mov: <IconVideo className={`${iconClass} text-purple-600`} />,
  avi: <IconVideo className={`${iconClass} text-purple-600`} />,
  webm: <IconVideo className={`${iconClass} text-purple-600`} />,
  mp3: <IconFileMusic className={`${iconClass} text-pink-500`} />,
  wav: <IconFileMusic className={`${iconClass} text-pink-500`} />,
  flac: <IconFileMusic className={`${iconClass} text-pink-500`} />,
  ogg: <IconFileMusic className={`${iconClass} text-pink-500`} />,
  m4a: <IconFileMusic className={`${iconClass} text-pink-500`} />,

  // Code
  js: <IconFileTypeJs className={`${iconClass} text-yellow-500`} />,
  mjs: <IconFileTypeJs className={`${iconClass} text-yellow-500`} />,
  cjs: <IconFileTypeJs className={`${iconClass} text-yellow-500`} />,
  jsx: <IconFileTypeJsx className={`${iconClass} text-yellow-500`} />,
  ts: <IconFileTypeTs className={`${iconClass} text-blue-500`} />,
  mts: <IconFileTypeTs className={`${iconClass} text-blue-500`} />,
  tsx: <IconFileTypeTsx className={`${iconClass} text-blue-500`} />,
  html: <IconFileTypeHtml className={`${iconClass} text-orange-500`} />,
  htm: <IconFileTypeHtml className={`${iconClass} text-orange-500`} />,
  css: <IconFileTypeCss className={`${iconClass} text-sky-500`} />,
  scss: <IconFileTypeCss className={`${iconClass} text-sky-500`} />,
  sass: <IconFileTypeCss className={`${iconClass} text-sky-500`} />,
  less: <IconFileTypeCss className={`${iconClass} text-sky-500`} />,
  xml: <IconFileTypeXml className={`${iconClass} text-indigo-500`} />,
  php: <IconFileTypePhp className={`${iconClass} text-indigo-600`} />,
  vue: <IconFileTypeVue className={`${iconClass} text-green-500`} />,
  json: <IconJson className={`${iconClass} text-amber-500`} />,
  jsonc: <IconJson className={`${iconClass} text-amber-500`} />,
  yaml: <IconFileCode className={`${iconClass} text-rose-500`} />,
  yml: <IconFileCode className={`${iconClass} text-rose-500`} />,
  toml: <IconFileCode className={`${iconClass} text-rose-500`} />,
  ini: <IconFileCode className={`${iconClass} text-zinc-500`} />,
  env: <IconFileCode className={`${iconClass} text-zinc-500`} />,
  py: <IconBrandPython className={`${iconClass} text-yellow-500`} />,
  go: <IconBrandGolang className={`${iconClass} text-cyan-500`} />,
  rs: <IconFileTypeRs className={`${iconClass} text-orange-600`} />,
  c: <IconFileCode className={`${iconClass} text-blue-500`} />,
  h: <IconFileCode className={`${iconClass} text-blue-500`} />,
  cpp: <IconBrandCpp className={`${iconClass} text-blue-600`} />,
  cc: <IconBrandCpp className={`${iconClass} text-blue-600`} />,
  hpp: <IconBrandCpp className={`${iconClass} text-blue-600`} />,
  cs: <IconBrandCSharp className={`${iconClass} text-purple-600`} />,
  java: <IconFileCode className={`${iconClass} text-orange-600`} />,
  kt: <IconFileCode className={`${iconClass} text-orange-600`} />,
  sh: <IconTerminal2 className={`${iconClass} text-zinc-500`} />,
  bash: <IconTerminal2 className={`${iconClass} text-zinc-500`} />,
  zsh: <IconTerminal2 className={`${iconClass} text-zinc-500`} />,
  sql: <IconFileTypeSql className={`${iconClass} text-indigo-500`} />,
  db: <IconFileDatabase className={`${iconClass} text-indigo-500`} />,
  sqlite: <IconFileDatabase className={`${iconClass} text-indigo-500`} />,

  // Security / certs
  pem: <IconCertificate className={`${iconClass} text-emerald-600`} />,
  crt: <IconCertificate className={`${iconClass} text-emerald-600`} />,
  cer: <IconCertificate className={`${iconClass} text-emerald-600`} />,
  key: <IconCertificate className={`${iconClass} text-emerald-600`} />,

  // Disk images / installers
  dmg: <IconDisc className={`${iconClass} text-zinc-500`} />,
  pkg: <IconPackage className={`${iconClass} text-amber-600`} />,
  exe: <IconBrandWindows className={`${iconClass} text-sky-600`} />,
  msi: <IconBrandWindows className={`${iconClass} text-sky-600`} />,
  deb: <IconBrandDebian className={`${iconClass} text-red-500`} />,
  rpm: <IconPackage className={`${iconClass} text-red-600`} />,
  appimage: <IconPackage className={`${iconClass} text-zinc-500`} />,
  iso: <IconDisc className={`${iconClass} text-zinc-500`} />,
};

export function getFileIconV2(mimeType?: string, filename?: string): React.ReactNode {
  const ext = filename ? getExtension(filename) : '';

  if (EXTENSION_ICON_MAP[ext]) return EXTENSION_ICON_MAP[ext];

  if (mimeType) {
    if (mimeType.startsWith('image/'))
      return <IconCamera className={`${iconClass} text-blue-500`} />;
    if (mimeType.startsWith('video/'))
      return <IconVideo className={`${iconClass} text-purple-600`} />;
    if (mimeType.startsWith('audio/'))
      return <IconMusic className={`${iconClass} text-pink-500`} />;
    if (mimeType.startsWith('text/') || mimeType.includes('json')) {
      return <IconFileCode className={`${iconClass} text-zinc-500`} />;
    }
  }

  return <IconFile className={`${iconClass} text-zinc-500`} />;
}

function getExtension(name: string): string {
  return name?.split('.').pop()?.toLowerCase() || '';
}
