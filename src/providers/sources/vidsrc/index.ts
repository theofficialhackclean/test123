import type { ShowMedia } from '@/entrypoint/utils/media';
import { flags } from '@/entrypoint/utils/targets';
import { SourcererOutput, makeSourcerer } from '@/providers/base';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';
import { createM3U8ProxyUrl } from '@/utils/proxy';

import { decode, mirza } from './decrypt';

// Default player configuration
const o = {
  y: 'xx??x?=xx?xx?=',
  u: '#1RyJzl3JYmljm0mkJWOGYWNyI6MfwVNGYXmj9uQj5tQkeYIWoxLCJXNkawOGF5QZ9sQj1YIWowLCJXO20VbVJ1OZ11QGiSlni0QG9uIn19',
};

async function vidsrcScrape(ctx: MovieScrapeContext | ShowScrapeContext): Promise<SourcererOutput> {
  const imdbId = ctx.media.imdbId;
  if (!imdbId) throw new NotFoundError('IMDb ID not found');

  const isShow = ctx.media.type === 'show';
  let season: number | undefined;
  let episode: number | undefined;

  if (isShow) {
    const show = ctx.media as ShowMedia;
    season = show.season?.number;
    episode = show.episode?.number;
  }

  const embedUrl = isShow
    ? `https://vidsrc.icu/embed/tv/${tmdbId}/${season}/${episode}`
    : `https://vidsrc.icu/embed/movie/${imdbId}`;

  ctx.progress(10);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
  const embedHtml = await ctx.proxiedFetcher<string>(embedUrl, {
    headers: {
      Referer: 'https://vidsrc.net/',
      'User-Agent': UA,
    },
  });

  ctx.progress(30);

  // Extract the iframe source using regex
  const iframeMatch = embedHtml.match(/<iframe[^>]*id="player_iframe"[^>]*src="([^"]*)"[^>]*>/);
  if (!iframeMatch) throw new NotFoundError('Initial iframe not found');

  const rcpUrl = iframeMatch[1].startsWith('//') ? `https:${iframeMatch[1]}` : iframeMatch[1];

  ctx.progress(50);

  const rcpHtml = await ctx.proxiedFetcher<string>(rcpUrl, {
    headers: { Referer: embedUrl, 'User-Agent': UA },
  });

  // Find the script with prorcp
  const scriptMatch = rcpHtml.match(/src\s*:\s*['"]([^'"]+)['"]/);
  if (!scriptMatch) throw new NotFoundError('prorcp iframe not found');

  const prorcpUrl = scriptMatch[1].startsWith('/') ? `https://cloudnestra.com${scriptMatch[1]}` : scriptMatch[1];

  ctx.progress(70);

  const finalHtml = await ctx.proxiedFetcher<string>(prorcpUrl, {
    headers: { Referer: rcpUrl, 'User-Agent': UA },
  });

  // Find script containing Playerjs
  const scripts = finalHtml.split('<script');
  let scriptWithPlayer = '';

  for (const script of scripts) {
    if (script.includes('Playerjs')) {
      scriptWithPlayer = script;
      break;
    }
  }

  if (!scriptWithPlayer) throw new NotFoundError('No Playerjs config found');

  const m3u8Match = scriptWithPlayer.match(/file\s*:\s*['"]([^'"]+)['"]/);
  if (!m3u8Match) throw new NotFoundError('No file field in Playerjs');

  let streamUrl = m3u8Match[1];

  if (!streamUrl.includes('.m3u8')) {
    // Check if we need to decode the URL
    const v = JSON.parse(decode(o.u));
    streamUrl = mirza(streamUrl, v);
  }

  ctx.progress(90);

  const headers = {
    referer: 'https://cloudnestra.com/',
    origin: 'https://cloudnestra.com',
  };

  return {
    stream: [
      {
        id: 'vidsrc-cloudnestra',
        type: 'hls',
        playlist: createM3U8ProxyUrl(streamUrl, headers),
        flags: [flags.CORS_ALLOWED],
        captions: [],
      },
    ],
    embeds: [],
  };
}

export const vidsrcScraper = makeSourcerer({
  id: 'cloudnestra',
  name: 'Cloudnestra',
  rank: 180,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: vidsrcScrape,
  scrapeShow: vidsrcScrape,
});
