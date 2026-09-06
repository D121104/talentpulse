import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

const MAX_CV_BYTES = 5 * 1024 * 1024;
const CLOUDINARY_HOSTS = ['cloudinary.com', 'cloudinary.net'];

export class CvDownloadError extends Error {
  constructor(
    public readonly code:
      | 'CV_URL_NOT_ALLOWED'
      | 'CV_REDIRECT_BLOCKED'
      | 'CV_DOWNLOAD_FAILED'
      | 'CV_TOO_LARGE'
      | 'CV_MEDIA_TYPE_INVALID',
  ) {
    super(code);
    this.name = 'CvDownloadError';
  }
}

function hostMatches(host: string, allowedHost: string): boolean {
  const normalized = allowedHost.trim().toLowerCase().replace(/^\*\./, '');
  return host === normalized || host.endsWith(`.${normalized}`);
}

function isAllowedHost(host: string, config: ConfigService): boolean {
  const configured = config
    .get<string>('AI_CV_ALLOWED_HOSTS')
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (configured?.length)
    return configured.some((item) => hostMatches(host, item));
  return (
    host === 'res.cloudinary.com' ||
    CLOUDINARY_HOSTS.some((item) => hostMatches(host, item))
  );
}

function mediaMatches(content: Buffer, mediaType: 'pdf' | 'docx'): boolean {
  if (mediaType === 'pdf')
    return content.subarray(0, 5).toString('ascii') === '%PDF-';
  return (
    content.length >= 4 &&
    content[0] === 0x50 &&
    content[1] === 0x4b &&
    content[2] === 0x03 &&
    content[3] === 0x04
  );
}

export async function downloadTrustedCv(
  url: string,
  mediaType: 'pdf' | 'docx',
  config: ConfigService,
): Promise<Buffer> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CvDownloadError('CV_URL_NOT_ALLOWED');
  }
  const cloudName = config.get<string>('CLOUD_NAME')?.trim().toLowerCase();
  const cloudNameInPath =
    !cloudName || parsed.pathname.toLowerCase().split('/').includes(cloudName);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !isAllowedHost(parsed.hostname.toLowerCase(), config) ||
    !cloudNameInPath
  ) {
    throw new CvDownloadError('CV_URL_NOT_ALLOWED');
  }

  let response;
  try {
    response = await axios.get<Readable>(parsed.toString(), {
      responseType: 'stream',
      timeout: Math.min(
        Number(
          config.get<string | number>('AI_CV_DOWNLOAD_TIMEOUT_MS') || 30000,
        ),
        30000,
      ),
      maxRedirects: 0,
      validateStatus: () => true,
      maxContentLength: MAX_CV_BYTES,
    });
  } catch {
    throw new CvDownloadError('CV_DOWNLOAD_FAILED');
  }
  if (response.status >= 300 && response.status < 400)
    throw new CvDownloadError('CV_REDIRECT_BLOCKED');
  if (response.status !== 200) throw new CvDownloadError('CV_DOWNLOAD_FAILED');
  const contentLength = Number(response.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_CV_BYTES) {
    response.data.destroy();
    throw new CvDownloadError('CV_TOO_LARGE');
  }

  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of response.data as Readable) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_CV_BYTES) {
        response.data.destroy();
        throw new CvDownloadError('CV_TOO_LARGE');
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof CvDownloadError) throw error;
    throw new CvDownloadError('CV_DOWNLOAD_FAILED');
  }
  const content = Buffer.concat(chunks);
  if (!mediaMatches(content, mediaType))
    throw new CvDownloadError('CV_MEDIA_TYPE_INVALID');
  return content;
}
