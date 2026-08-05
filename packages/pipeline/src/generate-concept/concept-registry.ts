export class ConceptRegistry {
  private knownIds: Set<string>;

  constructor(levelAConcepts: string[], levelBConcepts?: string[]) {
    this.knownIds = new Set([...levelAConcepts, ...(levelBConcepts ?? [])]);
  }

  register(id: string): void {
    this.knownIds.add(id);
  }

  validateDependencies(deps: string[]): { valid: string[]; missing: string[] } {
    const valid: string[] = [];
    const missing: string[] = [];

    for (const dep of deps) {
      if (this.knownIds.has(dep)) {
        valid.push(dep);
      } else {
        missing.push(dep);
      }
    }

    return { valid, missing };
  }

  isKnown(id: string): boolean {
    return this.knownIds.has(id);
  }

  getAllIds(): string[] {
    return Array.from(this.knownIds);
  }
}
