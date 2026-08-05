import type { DocumentScope } from './types.js';
import type { SourceInventory, SourceUnit } from '../source/types.js';

export interface ResolvedScope {
  filteredUnits: SourceUnit[];
  warnings: string[];
}

export function resolveScope(scope: DocumentScope, inventory: SourceInventory): ResolvedScope {
  const warnings: string[] = [];

  switch (scope.kind) {
    case 'all':
      return { filteredUnits: inventory.units, warnings: [] };

    case 'chapter-index': {
      const lessonUnits = inventory.units.filter((u) => u.type === 'lesson');
      const targetIdx = scope.index - 1;
      if (targetIdx < 0 || targetIdx >= lessonUnits.length) {
        warnings.push(
          `Chapter index ${scope.index} not found (only ${lessonUnits.length} lessons)`,
        );
        return { filteredUnits: inventory.units, warnings };
      }
      const targetLesson = lessonUnits[targetIdx]!;
      const startIdx = inventory.units.indexOf(targetLesson);
      const endIdx = inventory.units.findIndex(
        (u, i) => u.type === 'lesson' && i > startIdx && lessonUnits.indexOf(u) === targetIdx + 1,
      );
      const end = endIdx >= 0 ? endIdx : inventory.units.length;
      return { filteredUnits: inventory.units.slice(startIdx, end), warnings };
    }

    case 'chapter-id': {
      const matching = inventory.units.filter(
        (u) => u.id === scope.id || u.location.heading === scope.id,
      );
      if (matching.length === 0) {
        warnings.push(`Chapter ID "${scope.id}" not found in inventory`);
        return { filteredUnits: inventory.units, warnings };
      }
      return { filteredUnits: matching, warnings };
    }

    case 'pages': {
      const filtered = inventory.units.filter(
        (u) => u.location.pageStart >= scope.start && u.location.pageStart <= scope.end,
      );
      if (filtered.length === 0) {
        warnings.push(`No units found in page range ${scope.start}-${scope.end}`);
        return { filteredUnits: inventory.units, warnings };
      }
      return { filteredUnits: filtered, warnings };
    }

    case 'source-units': {
      const byId = new Map(inventory.units.map((u) => [u.id, u]));
      const filtered: SourceUnit[] = [];
      for (const id of scope.ids) {
        const unit = byId.get(id);
        if (unit) filtered.push(unit);
        else warnings.push(`Source unit "${id}" not found in inventory`);
      }
      if (filtered.length === 0) {
        warnings.push('No valid source unit IDs found');
        return { filteredUnits: inventory.units, warnings };
      }
      return { filteredUnits: filtered, warnings };
    }

    default:
      return { filteredUnits: inventory.units, warnings: [`Unknown scope kind`] };
  }
}
