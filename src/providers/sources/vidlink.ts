import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const vidlinkBase = 'https://vidlink.pro';

interface VidLinkStream {
  file: string;
  label: string;
  type: string;
}

interface VidLinkResponse {
  success: boolean;
  streams?: VidLinkStream[];
  message?: string;
}

async function getVidLinkCookies(ctx: ShowScrapeContext | MovieScrapeContext): Promise<string> {
  // First make a HEAD request to get initial cookies
  const cookieRes = await ctx.proxiedFetcher(vidlinkBase, {
    method: 'HEAD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
    responseType: 'text',
  });

  // Extract cookies from response headers
  const cookies = cookieRes.headers?.['set-cookie'] || [];
  return Array.isArray(cookies) ? cookies.join('; ') : cookies;
}

async function vidLinkScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  // Get initial cookies first
  const cookies = await getVidLinkCookies(ctx);

  const headers = {
    'Accept': 'application/json',
    'Cookie': cookies,
    'Referer': `${vidlinkBase}/`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  let apiUrl: string;
  if (ctx.media.type === 'movie') {
    apiUrl = `${vidlinkBase}/api/movie/${ctx.media.tmdbId}`;
  } else {
    apiUrl = `${vidlinkBase}/api/tv/${ctx.media.tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
  }

  try {
    // Initial request to get CSRF token if needed
    const initRes = await ctx.proxiedFetcher(vidlinkBase, {
      headers,
      method: 'GET',
      responseType: 'text',
    });

    // Update cookies if new ones were set
    const newCookies = initRes.headers?.['set-cookie'];
    if (newCookies) {
      headers['Cookie'] = Array.isArray(newCookies) 
        ? newCookies.join('; ') 
        : newCookies;
    }

    // Main API request
    const apiRes = await ctx.proxiedFetcher<VidLinkResponse>(apiUrl, {
      headers,
      method: 'GET',
      timeout: 15000,
      retry: {
        limit: 3,
        methods: ['GET'],
        statusCodes: [403, 429, 500, 502, 503, 504],
      },
    });

    if (!apiRes?.success) {
      throw new NotFoundError(apiRes?.message || 'VidLink API request failed');
    }

    if (!apiRes.streams?.length) {
      throw new NotFoundError('No streams available');
    }

    return {
      embeds: [],
      stream: [{
        id: 'primary',
        type: 'file',
        qualities: Object.fromEntries(
          apiRes.streams.map((stream, i) => [
            `quality_${i}`,
            { type: 'mp4', url: stream.file }
          ])
        ),
        captions: [],
        flags: [flags.CORS_ALLOWED],
      }],
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('security solution')) {
        throw new Error('VidLink blocked the request. Try using different IP or waiting.');
      }
      if (error.message.includes('403')) {
        throw new Error('VidLink access forbidden. Cookies may have expired.');
      }
    }
    throw error;
  }
}

export const vidLinkProvider = makeSourcerer({
  id: 'vidlink',
  name: 'VidLink',
  rank: 310,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidLinkScraper,
  scrapeShow: vidLinkScraper,
});
