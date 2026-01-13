import { load } from 'cheerio';

import { flags } from '@/entrypoint/utils/targets';
import { SourcererEmbed, SourcererOutput, makeSourcerer } from '@/providers/base';
import { compareMedia } from '@/utils/compare';
import { MovieScrapeContext, ShowScrapeContext } from '@/utils/context';
import { NotFoundError } from '@/utils/errors';

const baseUrl = 'https://mp4hydra.org/';

// Helper function to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with a single hyphen
}

async function movieScraper(ctx: MovieScrapeContext): Promise<SourcererOutput> {
  // First, search for the movie to get the correct slug/ID
  const searchPage = await ctx.proxiedFetcher('/search', {
    baseUrl,
    query: {
      q: ctx.media.title,
    },
  });

  ctx.progress(30);

  const $search = load(searchPage);
  const searchResults: { title: string; year?: number | undefined; slug: string }[] = [];

  $search('.search-details').each((_, element) => {
    const fullText = $search(element).find('a').first().text().trim();
    const url = $search(element).find('a').attr('href');

    if (!fullText || !url) return;

    // Extract the slug from the URL (e.g., /movie/movie-name-year)
    const urlParts = url.split('/').filter(x => x);
    const slug = urlParts.length >= 2 ? urlParts[urlParts.length - 1] : null;
    
    if (!slug) return;

    // Extract year from the title
    const yearMatch = fullText.match(/\((\d{4})(?:\s*-\s*\d{0,4})?\)/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    
    // Remove year information to get clean title
    const title = fullText.replace(/\s*\(?\s*\d{4}(?:\s*-\s*\d{0,4})?\s*\)?\s*$/, '').trim();

    if (!title) return;

    searchResults.push({ title, year, slug });
  });

  const match = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year));
  if (!match) throw new NotFoundError('No watchable item found');

  ctx.progress(50);

  // Now fetch streams using the found slug
  const data = await tryFetchStreams(ctx, match.slug, 'movie');

  if (!data || !data.playlist || data.playlist.length === 0 || !data.servers) {
    throw new NotFoundError('No watchable item found');
  }

  ctx.progress(80);

  const embeds: SourcererEmbed[] = [];
  const serverConfig = [
    { name: 'Beta', number: 1 },
    { name: 'Beta#3', number: 2 },
  ];

  serverConfig.forEach((server) => {
    if (data.servers[server.name]) {
      data.playlist.forEach((item) => {
        const videoUrl = `${data.servers[server.name]}${item.src}`;
        embeds.push({
          embedId: `mp4hydra-${server.number}`,
          url: `${videoUrl}|${item.label}`,
        });
      });
    }
  });

  ctx.progress(90);

  return { embeds };
}

async function showScraper(ctx: ShowScrapeContext): Promise<SourcererOutput> {
  // First, search for the show to get the correct slug/ID
  const searchPage = await ctx.proxiedFetcher('/search', {
    baseUrl,
    query: {
      q: ctx.media.title,
    },
  });

  ctx.progress(30);

  const $search = load(searchPage);
  const searchResults: { title: string; year?: number | undefined; slug: string }[] = [];

  $search('.search-details').each((_, element) => {
    const fullText = $search(element).find('a').first().text().trim();
    const url = $search(element).find('a').attr('href');

    if (!fullText || !url) return;

    // Extract the slug from the URL
    const urlParts = url.split('/').filter(x => x);
    const slug = urlParts.length >= 2 ? urlParts[urlParts.length - 1] : null;
    
    if (!slug) return;

    // Extract year from the title
    const yearMatch = fullText.match(/\((\d{4})(?:\s*-\s*\d{0,4})?\)/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    
    // Remove year information to get clean title
    const title = fullText.replace(/\s*\(?\s*\d{4}(?:\s*-\s*\d{0,4})?\s*\)?\s*$/, '').trim();

    if (!title) return;

    searchResults.push({ title, year, slug });
  });

  const match = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year));
  if (!match) throw new NotFoundError('No watchable item found');

  ctx.progress(50);

  const data = await tryFetchStreams(ctx, match.slug, 'tv', ctx.media.season.number, ctx.media.episode.number);

  if (!data || !data.playlist || data.playlist.length === 0 || !data.servers) {
    throw new NotFoundError('No watchable item found');
  }

  ctx.progress(60);

  // Find the specific episode
  const paddedSeason = ctx.media.season.number.toString().padStart(2, '0');
  const paddedEpisode = ctx.media.episode.number.toString().padStart(2, '0');
  const seasonEpisode = `S${paddedSeason}E${paddedEpisode}`;

  const targetEpisode = data.playlist.find(
    (item) => item.title && item.title.toUpperCase() === seasonEpisode.toUpperCase()
  );

  if (!targetEpisode) {
    throw new NotFoundError(`Episode ${seasonEpisode} not found`);
  }

  ctx.progress(80);

  const embeds: SourcererEmbed[] = [];
  const serverConfig = [
    { name: 'Beta', number: 1 },
    { name: 'Beta#3', number: 2 },
  ];

  serverConfig.forEach((server) => {
    if (data.servers[server.name]) {
      const videoUrl = `${data.servers[server.name]}${targetEpisode.src}`;
      embeds.push({
        embedId: `mp4hydra-${server.number}`,
        url: `${videoUrl}|${targetEpisode.label}`,
      });
    }
  });

  ctx.progress(90);

  return { embeds };
}

async function tryFetchStreams(
  ctx: MovieScrapeContext | ShowScrapeContext,
  slug: string,
  mediaType: 'movie' | 'tv',
  seasonNum?: number,
  episodeNum?: number
): Promise<{ playlist: { src: string; label: string; title?: string }[]; servers: { [key: string]: string } } | null> {
  try {
    // Create FormData - matching the Node.js version exactly
    const formData = new FormData();
    formData.append('v', '8');
    formData.append('z', JSON.stringify([
      {
        s: slug,
        t: mediaType,
        se: seasonNum,
        ep: episodeNum,
      },
    ]));

    const data = await ctx.proxiedFetcher('/info2?v=8', {
      method: 'POST',
      body: formData,
      baseUrl,
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Origin': 'https://mp4hydra.org',
        'Referer': `https://mp4hydra.org/${mediaType}/${slug}`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    });

    return data;
  } catch (error) {
    console.error('[MP4Hydra] Error fetching streams:', error);
    return null;
  }
}

export const mp4hydraScraper = makeSourcerer({
  id: 'mp4hydra',
  name: 'Mp4Hydra',
  rank: 3,
  disabled: false,
  flags: [flags.CORS_ALLOWED],
  scrapeMovie: movieScraper,
  scrapeShow: showScraper,
});