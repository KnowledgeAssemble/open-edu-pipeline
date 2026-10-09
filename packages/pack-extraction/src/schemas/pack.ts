// Local mirror. Canonical source of truth: @open-edu/packs (open-edu repo, Pack System story 1.1).
import { z } from 'zod';

export const PACK_FORMAT = 'openedu-pack' as const;
export const PACK_FORMAT_VERSION = 1 as const;

export const PackTypeSchema = z.enum(['knowledge', 'curriculum']);
export type PackType = z.infer<typeof PackTypeSchema>;

export const PackManifestSchema = z
  .object({
    format: z.literal(PACK_FORMAT),
    formatVersion: z.literal(PACK_FORMAT_VERSION),
    type: PackTypeSchema,
    id: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'id must be kebab-case'),
    version: z
      .string()
      .min(1)
      .max(64)
      .regex(/^\d+\.\d+\.\d+$/, 'version must be semver (e.g. 1.0.0)'),
    name: z.string().min(1).max(256),
    description: z.string().max(4096).optional(),
    author: z.string().min(1).max(128),
    language: z.enum(['en', 'hi', 'or']).default('en'),
    requires: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/)).default([]),
    derivedFrom: z.enum(['document']).optional(),
  })
  .strict();

export type PackManifestSchema = z.infer<typeof PackManifestSchema>;
export type PackManifest = z.infer<typeof PackManifestSchema>;
