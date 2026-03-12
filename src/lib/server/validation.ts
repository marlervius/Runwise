import { HRZone } from "@/types/runwise";
import { badRequest } from "./api";

export type JsonObject = Record<string, unknown>;

type NumberOptions = {
  integer?: boolean;
  min?: number;
  max?: number;
};

type StringOptions = {
  minLength?: number;
  maxLength?: number;
  allowEmpty?: boolean;
};

export function asObject(value: unknown, message: string = "JSON body must be an object."): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(message);
  }

  return value as JsonObject;
}

export function hasField(body: JsonObject, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

export function parseOptionalNumber(
  value: unknown,
  field: string,
  options: NumberOptions = {}
): number | undefined {
  if (value === undefined) return undefined;

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw badRequest(`${field} must be a valid number.`);
  }

  if (options.integer && !Number.isInteger(value)) {
    throw badRequest(`${field} must be an integer.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw badRequest(`${field} must be at least ${options.min}.`);
  }

  if (options.max !== undefined && value > options.max) {
    throw badRequest(`${field} must be at most ${options.max}.`);
  }

  return value;
}

export function parseOptionalString(
  value: unknown,
  field: string,
  options: StringOptions = {}
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw badRequest(`${field} must be a string.`);
  }

  const trimmed = value.trim();
  const allowEmpty = options.allowEmpty ?? true;

  if (!allowEmpty && trimmed.length === 0) {
    throw badRequest(`${field} cannot be empty.`);
  }

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw badRequest(`${field} must be at least ${options.minLength} characters.`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw badRequest(`${field} must be at most ${options.maxLength} characters.`);
  }

  return trimmed;
}

export function parseOptionalNullableString(
  value: unknown,
  field: string,
  options: StringOptions = {}
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return parseOptionalString(value, field, options);
}

export function parseOptionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowedValues: readonly T[]
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw badRequest(`${field} must be one of: ${allowedValues.join(", ")}.`);
  }

  return value as T;
}

export function parseRequiredEnum<T extends string>(
  value: unknown,
  field: string,
  allowedValues: readonly T[]
): T {
  const parsed = parseOptionalEnum(value, field, allowedValues);
  if (!parsed) {
    throw badRequest(`${field} is required.`);
  }

  return parsed;
}

export function parseOptionalDateString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw badRequest(`${field} must be a date string.`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(`${trimmed}T00:00:00Z`))) {
    throw badRequest(`${field} must use YYYY-MM-DD format.`);
  }

  return trimmed;
}

export function parseOptionalHrZones(value: unknown, field: string): HRZone[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (!Array.isArray(value) || value.length !== 5) {
    throw badRequest(`${field} must contain exactly 5 heart-rate zones.`);
  }

  const zones = value.map((zone, index) => {
    if (!zone || typeof zone !== "object" || Array.isArray(zone)) {
      throw badRequest(`${field}[${index}] must be an object.`);
    }

    const { min, max } = zone as Record<string, unknown>;
    const parsedMin = parseOptionalNumber(min, `${field}[${index}].min`, { min: 0, max: 300 });
    const parsedMax = parseOptionalNumber(max, `${field}[${index}].max`, { min: 0, max: 300 });

    if (parsedMin === undefined || parsedMax === undefined) {
      throw badRequest(`${field}[${index}] must include min and max values.`);
    }

    if (parsedMin >= parsedMax) {
      throw badRequest(`${field}[${index}] min must be lower than max.`);
    }

    return { min: parsedMin, max: parsedMax };
  });

  for (let i = 1; i < zones.length; i++) {
    if (zones[i - 1].max > zones[i].min) {
      throw badRequest(`${field} zones must be ordered from low to high.`);
    }
  }

  return zones;
}

export function parsePositiveIntegerString(value: string, field: string): number {
  if (!/^\d+$/.test(value)) {
    throw badRequest(`${field} must be a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw badRequest(`${field} must be a positive integer.`);
  }

  return parsed;
}
