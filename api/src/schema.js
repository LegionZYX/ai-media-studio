import { z } from 'zod'

const metricSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  note: z.string().min(1),
})

const serviceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  price: z.string().min(1),
})

const faqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
})

const sectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
})

const seedancePayloadSchema = z.object({
  model: z.string().min(1),
  prompt: z.string().min(1),
  image: z.string().min(1).optional(),
  image_tail: z.string().min(1).optional(),
  images: z.array(z.string().min(1)).optional(),
  video: z.string().min(1).optional(),
  audio: z.string().min(1).optional(),
  duration: z.number().int().min(4).max(15).optional(),
  resolution: z.enum(['480p', '720p', '1080p']).optional(),
  aspect_ratio: z.enum(['16:9', '9:16', '3:4', '4:3', '1:1', '21:9', 'adaptive']).optional(),
  watermark: z.boolean().optional(),
  async: z.boolean().optional(),
  extra_body: z
    .object({
      real_person_mode: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
}).passthrough()

export const contentSchema = z.object({
  site: z.object({
    title: z.string().min(1),
    subtitle: z.string().min(1),
    primaryAction: z.string().min(1),
    secondaryAction: z.string().min(1),
  }),
  metrics: z.array(metricSchema),
  services: z.array(serviceSchema),
  sections: z.array(sectionSchema).default([]),
  faq: z.array(faqSchema),
})

export const seedanceJobSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  payload: seedancePayloadSchema,
})

export const seedanceAssetGroupSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  name: z.string().min(1),
  platform: z.string().min(1).default('bytedance'),
})

export const seedanceAssetCreateSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  group_id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  asset_type: z.string().min(1),
  platform: z.string().min(1).default('bytedance'),
})
