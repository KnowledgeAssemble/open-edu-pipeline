import { z } from 'zod';

export const SVG_RENDERER_TYPES = [
  'place-value-chart',
  'number-line',
  'fraction-bar',
  'fraction-circle',
  'decimal-grid',
  'measurement-scale',
  'area-grid',
  'perimeter-grid',
  'geometry-basic',
  'bar-chart',
  'pictograph',
] as const;

export type SvgRendererType = (typeof SVG_RENDERER_TYPES)[number];

export const AssetManifestEntrySchema = z.object({
  id: z.string().min(1),
  filename: z
    .string()
    .min(1)
    .regex(/\.svg$/),
  mediaType: z.literal('image/svg+xml'),
  altText: z.string().min(1),
  caption: z.string().optional(),
  rendererType: z.string().min(1),
  conceptIds: z.array(z.string()).min(1),
  sourceUnitIds: z.array(z.string()),
  parameters: z.record(z.unknown()),
});

export type AssetManifestEntry = z.infer<typeof AssetManifestEntrySchema>;

export const AssetManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  assets: z.array(AssetManifestEntrySchema),
});

export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export const AssetPlanResponseSchema = z.object({
  assets: z.array(AssetManifestEntrySchema),
});
