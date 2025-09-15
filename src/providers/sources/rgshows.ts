import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { SourcererOutput, makeSourcerer } from '../base';

const baseUrl = 'api.rgshows.me';

const headers = {
  referer: 'https://rgshows.me/',
  origin: 'https://rgshows.me',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  accept: 'application/json, text/plain, */*',
};

async function comboScraper(ctx: ShowScrapeContext | MovieScrapeContext): Promise<SourcererOutput> {
  let url = `https://${baseUrl}/main`;

  if (ctx.media.type === 'movie') {
    url += `/movie/${ctx.media.tmdbId}`;
  } else {
    url += `/tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
  }

  // ⏳ Add timeout so Cloudflare hangs don’t freeze everything
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: any;
  try {
    res = await ctx.proxiedFetcher(url, { headers, signal: controller.signal });
  } catch (err) {
    throw new NotFoundError('Failed to fetch stream (Cloudflare or timeout)');
  } finally {
    clearTimeout(timeout);
  }

  if (!res?.stream?.url) {
    throw new NotFoundError('No streams found');
  }

  if (res.stream.url === 'https://vidzee.wtf/playlist/69/master.m3u8') {
    throw new NotFoundError('Found only vidzee porn stream');
  }

  const streamUrl = res.stream.url;

  // ✅ Use same headers for manifest + chunks
  const m3u8Headers = {
    ...headers,
    accept: '*/*',
    'accept-encoding': 'gzip, deflate, br',
    connection: 'keep-alive',
    range: 'bytes=0-',
  };

  ctx.progress(100);

  return {
    embeds: [],
    stream: [
      {
        id: 'primary',
        type: 'hls',
        playlist: streamUrl,
        headers: m3u8Headers,
        flags: [],
        captions: [],
      },
    ],
  };
}

export const rgshowsScraper = makeSourcerer({
  id: 'rgshows',
  name: 'RGShows',
  rank: 173,
  flags: [],
  scrapeMovie: comboScraper,
  scrapeShow: comboScraper,
});
