export interface PrimitiveValue {
  kind: 'primitive';
  value: string | number | boolean | null | undefined;
  truncatedChars?: number;
}

export interface SpecialScalarValue {
  kind: 'bigint' | 'symbol' | 'function' | 'date' | 'regexp';
  preview: string;
}

export interface ObjectEntry {
  key: string;
  value: SerializedValue;
}

export interface ArrayValue {
  kind: 'array';
  preview: string;
  items: SerializedValue[] | null;
  omittedCount: number;
}

export interface ObjectValue {
  kind: 'object';
  preview: string;
  className: string | null;
  entries: ObjectEntry[] | null;
  omittedCount: number;
}

export interface MapEntry {
  key: SerializedValue;
  value: SerializedValue;
}

export interface MapValue {
  kind: 'map';
  preview: string;
  entries: MapEntry[] | null;
  omittedCount: number;
}

export interface SetValue {
  kind: 'set';
  preview: string;
  items: SerializedValue[] | null;
  omittedCount: number;
}

export interface ErrorValue {
  kind: 'error';
  name: string;
  message: string;
  stack?: string;
}

export interface PromiseValue {
  kind: 'promise';
}

export interface CircularValue {
  kind: 'circular';
  label: string;
}

export type SerializedValue =
  | PrimitiveValue
  | SpecialScalarValue
  | ArrayValue
  | ObjectValue
  | MapValue
  | SetValue
  | ErrorValue
  | PromiseValue
  | CircularValue;
