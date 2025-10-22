import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';

const providers = [
  { id: 'webtor-1080', rank: 80 },
  { id: 'webtor-4k', rank: 79 },
  { id: 'webtor-720', rank: 78 },
  { id: 'webtor-480', rank: 77 },
];

function embed(provider: { id: string; rank: number }) {
  return makeEmbed({
    id: provider.id,
    name: `Webtor ${provider.id.split('-')[1].toUpperCase()}`,
    rank: provider.rank,
    async scrape(ctx) {
      // Webtor URLs are not direct MP4s — they must be embedded instead of fetched
      const videoUrl = ctx.url.startsWith('http://82.22.77.247:3000/')
        ? ctx.url
        : `http://82.22.77.247:3000/magnet/download?link=${encodeURIComponent(ctx.url)}`;

      return {
        stream: [
          {
            id: 'primary',
            type: 'file',
            qualities: {
              unknown: {
                type: 'mp4',
                url: videoUrl, // ✅ properly encoded and playable
              },
            },
            flags: [flags.CORS_ALLOWED],
            captions: [],
          },
        ],
      };
    },
  });
}

export const [
  webtor1080Scraper,
  webtor4kScraper,
  webtor720Scraper,
  webtor480Scraper,
] = providers.map(embed);
