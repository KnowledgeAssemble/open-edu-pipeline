import { isKnownWidgetId, getWidgetSchema } from '../generate-activities/widget-schemas.js';

export interface WidgetValidationResult {
  widgetId: string;
  valid: boolean;
  errors: string[];
}

export function validateWidgetConfig(widgetId: string, config: unknown): WidgetValidationResult {
  const errors: string[] = [];

  if (!isKnownWidgetId(widgetId)) {
    errors.push(`Unknown widget ID: "${widgetId}"`);
    return { widgetId, valid: false, errors };
  }

  const schema = getWidgetSchema(widgetId);
  if (!schema) {
    errors.push(`No schema found for widget: "${widgetId}"`);
    return { widgetId, valid: false, errors };
  }

  const result = schema.safeParse(config);
  if (!result.success) {
    errors.push(`Widget config validation failed for "${widgetId}": ${result.error.message}`);
    return { widgetId, valid: false, errors };
  }

  return { widgetId, valid: true, errors: [] };
}
