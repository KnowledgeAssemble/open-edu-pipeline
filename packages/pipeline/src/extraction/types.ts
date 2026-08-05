import { z } from 'zod';

export const EXTRACTION_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/markdown',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/zip',
] as const;

export type ExtractionMimeType = (typeof EXTRACTION_SUPPORTED_MIME_TYPES)[number];

export const ExtractionInputSchema = z.object({
  filePath: z.string().min(1, 'filePath is required'),
  mimeType: z.enum(EXTRACTION_SUPPORTED_MIME_TYPES).optional(),
  extractorId: z.string().optional(),
  options: z
    .object({
      extractImages: z.boolean().default(true).optional(),
      preserveHeadings: z.boolean().default(true).optional(),
      preserveTables: z.boolean().default(true).optional(),
      ocrLanguage: z.string().default('en').optional(),
      noOcr: z.boolean().optional(),
      ocrServerUrl: z.string().optional(),
      imageMode: z.string().optional(),
      targetPages: z.string().optional(),
      maxPages: z.number().int().positive().optional(),
    })
    .optional(),
});

export type ExtractionInput = z.infer<typeof ExtractionInputSchema>;

export const AssetInfoSchema = z.object({
  filename: z.string().min(1),
  originalName: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export type AssetInfo = z.infer<typeof AssetInfoSchema>;

export const ComplexityMetadataSchema = z.enum(['low', 'medium', 'high']);

export type ComplexityLevel = z.infer<typeof ComplexityMetadataSchema>;

export const ExtractionManifestSchema = z.object({
  id: z.string().min(1),
  sourceType: z.string().min(1),
  extractor: z.string().min(1),
  version: z.string().min(1),
  pages: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  tables: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  createdAt: z.string().datetime(),
  complexity: ComplexityMetadataSchema,
});

export type ExtractionManifest = z.infer<typeof ExtractionManifestSchema>;

export const ExtractionResultSchema = z.object({
  contentMd: z.string().min(1, 'contentMd must not be empty'),
  manifest: ExtractionManifestSchema,
  assets: z.array(AssetInfoSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const ExtractionErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  recoverable: z.boolean(),
});

export type ExtractionError = z.infer<typeof ExtractionErrorSchema>;

export const EXTRACTION_ERROR_CODES = [
  'UNSUPPORTED_FORMAT',
  'FILE_NOT_FOUND',
  'EXTRACTION_FAILED',
  'OCR_FAILED',
  'ZIP_EXTRACTION_FAILED',
  'NORMALIZATION_FAILED',
] as const;

export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number];
