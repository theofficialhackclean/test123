import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';

const providers = [
  {
    id: 'rive-hydrax',
    rank: 270,
  },
  {
    id: 'rive-fastx',
    rank: 269,
  },
  {
    id: 'rive-filmecho',
    rank: 268,
  },
  {
    id: 'rive-nova',
    rank: 267,
  },
  {
    id: 'rive-guru',
    rank: 266,
  },
  {
    id: 'rive-g1',
    rank: 265,
  },
  {
    id: 'rive-g2',
    rank: 264,
  },
  {
    id: 'rive-ee3',
    rank: 263,
  },
  {
    id: 'rive-ghost',
    rank: 262,
  },
  {
    id: 'rive-putafilme',
    rank: 261,
  },
  {
    id: 'rive-asiacloud',
    rank: 260,
  },
  {
    id: 'rive-kage',
    rank: 259,
  },
];

function embed(provider: { id: string; rank: number; disabled?: boolean }) {
  return makeEmbed({
    id: provider.id,
    name: provider.id
      .split('-')
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' '),
    disabled: provider.disabled,
    rank: provider.rank,
    async scrape(ctx) {
      const isHLS = ctx.url.includes('.m3u8') || ctx.url.includes('hls') || ctx.url.includes('playlist');

      if (isHLS) {
        return {
          stream: [
            {
              id: 'primary',
              type: 'hls',
              playlist: ctx.url,
              flags: [flags.CORS_ALLOWED],
              captions: [],
            },
          ],
        };
      }
      return {
        stream: [
          {
            id: 'primary',
            type: 'file',
            qualities: {
              unknown: {
                type: 'mp4',
                url: ctx.url,
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
  riveHydraxScraper,
  riveFastxScraper,
  riveFilmechoScraper,
  riveNovaScraper,
  riveGuruScraper,
  riveG1Scraper,
  riveG2Scraper,
  riveEe3Scraper,
  riveGhostScraper,
  rivePutafilmeScraper,
  riveAsiacloudScraper,
  riveKageScraper,
] = providers.map(embed);