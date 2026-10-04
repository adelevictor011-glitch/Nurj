// Placements for channel-ready output (roadmap feature 15). Limits are the
// targets Nurj writes to, below each platform's own limit (checked 3 October
// 2026). Keep in step with CHANNELS in api/enhance.ts.

export interface ChannelSpec {
  key: string;
  group: 'WhatsApp' | 'Instagram' | 'TikTok' | 'Email';
  label: string;
  limit: number;
  platformLimit: string;
  subject?: number;
}

export const CHANNELS: ChannelSpec[] = [
  { key: 'whatsapp_message', group: 'WhatsApp', label: 'Chat or broadcast message', limit: 1000, platformLimit: 'no published limit' },
  { key: 'whatsapp_status', group: 'WhatsApp', label: 'Status', limit: 500, platformLimit: '700' },
  { key: 'whatsapp_business', group: 'WhatsApp', label: 'Business description', limit: 480, platformLimit: '512' },
  { key: 'instagram_caption', group: 'Instagram', label: 'Feed or Reels caption', limit: 600, platformLimit: '2,200' },
  { key: 'instagram_bio', group: 'Instagram', label: 'Bio', limit: 140, platformLimit: '150' },
  { key: 'tiktok_caption', group: 'TikTok', label: 'Video caption', limit: 300, platformLimit: '4,000' },
  { key: 'tiktok_photo_title', group: 'TikTok', label: 'Photo post title', limit: 80, platformLimit: '90' },
  { key: 'tiktok_bio', group: 'TikTok', label: 'Bio', limit: 75, platformLimit: '80' },
  { key: 'email', group: 'Email', label: 'Email (subject + body)', limit: 1100, platformLimit: 'no hard limit', subject: 50 },
];

export const CHANNEL_BY_KEY = Object.fromEntries(CHANNELS.map((channel) => [channel.key, channel]));
