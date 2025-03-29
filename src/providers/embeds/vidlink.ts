import { flags } from '@/entrypoint/utils/targets';
import { makeEmbed } from '@/providers/base';
import { getValidQualityFromString } from '@/utils/quality';

const vidlinkProviders = [
  {
    id: 'vidlink-1',
    name: 'VidLink Server 1',
    rank: 36,
  },
  {
    id: 'vidlink-2',
    name: 'VidLink Server 2',
    rank: 35,
    disabled: false, // Set to true if you want to disable by default
  },
  {
    id: 'vidlink-4k',
    name: 'VidLink 4K Server',
    rank: 40, // Higher rank for 4K quality
  },
];

function createVidLinkEmbed(provider: { id: string; name: string; rank: number; disabled?: boolean }) {
  return makeEmbed({
    id: provider.id,
    name: provider.name,
    disabled: provider.disabled,
    rank: provider.rank,
    async scrape(ctx) {
      // Split URL and quality from the context
      const [url, quality] = ctx.url.split('|');
      
      // Additional VidLink specific processing if needed
      let finalUrl = url;
      let finalQuality = getValidQualityFromString(quality || '');
      
      // Special handling for 4K server
      if (provider.id === 'vidlink-4k') {
        finalUrl = url.replace('/play/', '/play/4k/'); // Example modification for 4K
        finalQuality = 2160; // Force 4K quality
      }
      
      // Validate the URL
      if (!finalUrl || !finalUrl.includes('vidlink.pro')) {
        throw new Error('Invalid VidLink URL');
      }

      return {
        stream: [
          {
            id: 'primary',
            type: 'file',
            qualities: {
              [finalQuality]: { 
                url: finalUrl, 
                type: 'mp4' // Assuming MP4, adjust if needed
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
  vidlinkServer1Scraper,
  vidlinkServer2Scraper,
  vidlink4kScraper,
] = vidlinkProviders.map(createVidLinkEmbed);