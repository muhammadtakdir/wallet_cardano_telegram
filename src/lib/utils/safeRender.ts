/**
 * Safe render utilities to prevent React Error #185
 * "Objects are not valid as a React child"
 */

/**
 * Safely convert any value to a string for rendering
 * Handles objects, arrays, undefined, null, etc.
 */
export function safeString(value: unknown, fallback: string = ""): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  
  if (typeof value === "string") {
    return value;
  }
  
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  
  if (typeof value === "object") {
    // Log warning for debugging
    console.warn("safeString received object:", value);
    try {
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }
  
  return String(value);
}

/**
 * Safely render a number with fallback
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  
  const num = Number(value);
  return isNaN(num) ? fallback : num;
}

/**
 * Check if a value is safe to render as a React child
 */
export function isSafeChild(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true; // React handles null/undefined
  }
  
  const type = typeof value;
  return type === "string" || type === "number" || type === "boolean";
}

/**
 * Debug log all values in an object to check for non-primitives
 */
export function debugLogObject(name: string, obj: Record<string, unknown>): void {
  console.log(`=== ${name} Type Check ===`);
  for (const [key, value] of Object.entries(obj)) {
    const type = typeof value;
    const isArray = Array.isArray(value);
    const isSafe = isSafeChild(value);
    console.log(`${key}:`, {
      value: isArray ? `Array(${(value as unknown[]).length})` : value,
      type,
      isArray,
      isSafe,
      constructor: value?.constructor?.name
    });
  }
  console.log(`=== End ${name} ===`);
}
