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

async function simulateBrowserVisit(ctx: ShowScrapeContext | MovieScrapeContext): Promise<Record<string, string>> {
  // First visit the main page to establish session
  const homeResponse = await ctx.proxiedFetcher(vidlinkBase, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    }
  });

  // Extract cookies and build headers for subsequent requests
  const cookies = homeResponse.headers?.['set-cookie'] || [];
  const cookieString = Array.isArray(cookies) ? cookies.join('; ') : cookies;

  return {
    'Cookie': cookieString,
    'Referer': vidlinkBase,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
  };
}

async function vidLinkScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  // Simulate browser visit to establish session
  const headers = await simulateBrowserVisit(ctx);

  // Add random delay to mimic human behavior
  await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));

  let apiUrl: string;
  if (ctx.media.type === 'movie') {
    apiUrl = `${vidlinkBase}/movie/${ctx.media.tmdbId}`;
  } else {
  apiUrl = `${vidlinkBase}/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
  }

  try {
    // Make the API request with proper browser-like headers
    const apiRes = await ctx.proxiedFetcher<VidLinkResponse>(apiUrl, {
      headers,
      method: 'GET'
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
      if (error.message.includes('blocked') || error.message.includes('security')) {
        throw new Error('VidLink blocked the request. Try using residential proxies or rotating IPs.');
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
