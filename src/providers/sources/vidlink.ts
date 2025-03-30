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

async function emulateBrowserSession(ctx: ShowScrapeContext | MovieScrapeContext) {
  // Step 1: Initial page visit to establish session
  const sessionHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
  };

  // Initial document request
  const homeResponse = await ctx.proxiedFetcher(vidlinkBase, {
    method: 'GET',
    headers: sessionHeaders
  });

  // Step 2: Extract and set cookies
  const cookies = homeResponse.headers?.['set-cookie'] || [];
  const cookieString = Array.isArray(cookies) ? cookies.join('; ') : cookies;

  // Step 3: Request static assets to build complete browser fingerprint
  const assetHeaders = {
    ...sessionHeaders,
    'Cookie': cookieString,
    'Referer': vidlinkBase,
    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  };

  await Promise.all([
    ctx.proxiedFetcher(`${vidlinkBase}/favicon.ico`, {
      method: 'GET',
      headers: assetHeaders
    }),
    ctx.proxiedFetcher(`${vidlinkBase}/assets/js/app.js`, {
      method: 'GET',
      headers: assetHeaders
    }),
    ctx.proxiedFetcher(`${vidlinkBase}/assets/css/style.css`, {
      method: 'GET',
      headers: assetHeaders
    })
  ]);

  return {
    cookies: cookieString,
    headers: {
      ...sessionHeaders,
      'Cookie': cookieString,
      'Referer': vidlinkBase,
      'X-Requested-With': 'XMLHttpRequest',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Accept': 'application/json',
    }
  };
}

async function vidLinkScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  // Establish browser session
  const { cookies, headers } = await emulateBrowserSession(ctx);

  // Add random delay to mimic human reading time
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

  let apiUrl: string;
  if (ctx.media.type === 'movie') {
    apiUrl = `${vidlinkBase}/movie/${ctx.media.tmdbId}`;
  } else {
    apiUrl = `${vidlinkBase}/tv/${ctx.media.tmdbId}?season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
  }

  try {
    // Make API request with full browser context
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
        throw new Error(`
          VidLink blocked the request. Additional measures needed:
          1. Use residential proxies (Luminati, Smartproxy)
          2. Implement request throttling (3-5s between requests)
          3. Rotate User-Agents and fingerprints
          4. Consider using Puppeteer with stealth plugin
        `);
      }
    }
    throw error;
  }
}

export const vidLinkProvider = makeSourcerer({
  id: 'vidlink',
  name: 'VidLink',
  rank:  310,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidLinkScraper,
  scrapeShow: vidLinkScraper,
});
